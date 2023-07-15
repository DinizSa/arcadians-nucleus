import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders/glTF";
import * as BABYLON from "@babylonjs/core/Legacy/legacy";
import mergeImages from 'merge-images';

import { Engine, Scene, Vector3, Mesh, HemisphericLight, Color3, FreeCamera, SceneLoader } from "@babylonjs/core";
import * as CANNON from "cannon";

interface MetadataSlot {
    // item_contract_address: string,
    item_id: number,
    trait_type: string,
    value: string,
    // is_base_item: boolean
}
interface ItemMap {
    "composite-op": string,
    name: string,
    opacity: string,
    src: string,
    visibility: string,
    x: string,
    y: string
}
interface SlotMap {
    "composite-op": string,
    name: string,
    opacity: string,
    visibility: string,
    layer: ItemMap[]
}

interface Weapon {
    id: number;
    image: string;
    name: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'legenday' | 'epic';
    physicalDamage: number;
    magicDamage: number;
    range: number;
    weight: number,
    reloadTime: number;
    type: 'spell' | 'melee' | 'gun';
    projectileSpeed: number;
    projectileWeight: number;
    accuracyRadius: number;
    radiusArea: number;
    frostDuration: number;
    burnDuration: number;
    burnTotalDamage: number;
    lifesteal: number;
    specialSpellType: 'heal' | 'convert' | 'increaseArmor' | 'increaseMagicResist';
    spellAmount: number;
    spellRange: number;
    spellMaxTargets: number;
    slotName?: string;
};

interface CharacterMetadata {
    armor: number; // percentage or physical damage ignored
    magicResist: number; // percentage of magic damage ignored
}

const slotsNames = {
    eyes: "Eyes",
    mouth: "Mouth",
    skin: "Skin",
    gender: "Gender",
    hairstyle: "Hairstyle",
    background: "Background",
    rightHand: "Right Hand",
    bottom: "Bottom",
    top: "Top",
    class: "Class",
    shadow: "Shadow",
    headgear: "Headgear",
    leftHand: "Left Hand",
    accessory: "Accessory"
};

const ANIMATION_LIST = {
    idle: "m.idle",
    walk: "m.walk",
    talk: "m.talk",
    talkPositive: "m.talkpositive",
    talkNegative: "m.talknegative",
    hit: "m.hit",
    stun: "m.stun",
    death: "m.death",
    win: "m.win",
    lose: "m.lose",
    skillBuff: "m.skillBuff",
    skillMelee: "m.skillMelee",
    skillRanged: "m.skillRanged",
    attackAssassin: "m.atkAss",
    attackGunner: "m.atkGun",
    attackKnight: "m.atkKni",
    attackTech: "m.atkTec",
    attackWizard: "m.atkWiz",
}

class App {
    // General Entire Application
    private _scene: Scene;
    private _canvas: HTMLCanvasElement;
    private _engine: Engine;

    //Scene - related
    private SEPARATOR = '_';

    private selectedCharacterId: number;

    private _stack: SlotMap[];
    private weaponsList: Weapon[];

    private _projetile: Mesh;
    private _projetileSword: Mesh;
    private _selectedMark: Mesh;

    private fieldFimensions = new Vector3(300, 0, 100)
    private FPS = 60;
    private GRAVITY = -9.81;
    private MAX_SOUND_DISTANCE = 50;
    private arcadiansSize = {
        width: 1.2,
        height: 2.7
    }

    constructor() {
        this._canvas = this._createCanvas()

        // hide/show the Inspector
        window.addEventListener("keydown", (ev) => {
            if (ev.shiftKey && ev.keyCode === 73) {
                if (this._scene.debugLayer.isVisible()) {
                    this._scene.debugLayer.hide();
                } else {
                    this._scene.debugLayer.show();
                    // new BABYLON.AxesViewer(this._scene, 20)
                }
            }
        });

        this._main();
    }

    private async _main(): Promise<void> {

        await this.loadFilesToMemory();

        this.createScene();

        this.createTerrain();

        this.setupSelectedMark();
        this.setupHpBar()
        this.setupProjectile();
        this.setupHitEffect();
        this.setupSpriteManagers();

        const rowsArcadians = 5;
        const colsArcadians = 2;
        const distanceArcadians = 10;
        const startX = this.fieldFimensions.x/2 - (rowsArcadians/2) * distanceArcadians;
        const startZ = this.fieldFimensions.z/2 - (colsArcadians/2) * distanceArcadians;
        for (let i = 0; i < rowsArcadians; i++) {
            for (let j = 0; j < colsArcadians; j++) {
                const counter = 1 + i * rowsArcadians + j;
                this.loadArcadian(counter, new Vector3(startX + i * distanceArcadians, 5, startZ + j * distanceArcadians));
            }
        }

        // run the main render loop
        this._engine.runRenderLoop(() => {
            this._scene.render();
        });

        // Handle pointer clicks
        this._scene.onPointerDown = (event: BABYLON.IPointerEvent, pickInfo: BABYLON.PickingInfo) => {
            if (event.button == 0 && pickInfo.hit) {
                if (this.selectedCharacterId && pickInfo.hit && pickInfo.pickedMesh.metadata == "ground") {
                    this.moveCharacter(this.selectedCharacterId, pickInfo.pickedPoint);
                    this.selectedCharacterId = 0;
                    this._selectedMark.setEnabled(false);
                } else {
                    const tags = BABYLON.Tags.GetTags(pickInfo.pickedMesh) || [];
                    if (tags.includes("arcadian")) {
                        this.selectedCharacterId = pickInfo.pickedMesh.uniqueId;
                        this.startSelectedMarkAnim(this.selectedCharacterId);
                    }
                }
            }
        }

        window.addEventListener("keydown", (ev) => {
            if (ev.keyCode === 32) {
                if (this.selectedCharacterId) {
                    this.useWeapon(this.selectedCharacterId);
                }
            }
        });
    }

    private startSelectedMarkAnim(parentUniqueId: number) {
        const parentMesh = this.getRootMesh(parentUniqueId)
        this._selectedMark.setEnabled(true);
        this._selectedMark.parent = parentMesh;
        this._selectedMark.position.y = parentMesh.getBoundingInfo().maximum.y + 1;
        this._scene.beginAnimation(this._selectedMark, 0, this.FPS * 2, true);
    }

    private setupSelectedMark() {
        const texture = this.getTexture("environment/Gem.png", true);
        texture.hasAlpha = true;
        texture.uScale = 1;
        texture.vScale = 1;
        const material = new BABYLON.StandardMaterial("selectedMark", this._scene);
        material.diffuseTexture = texture;
        let mark = BABYLON.MeshBuilder.CreatePlane("selectedMark", {width: 1, height: 1})
        mark.isPickable = false;
        mark.material = material;
        mark.rotate(new Vector3(0,1,0), Math.PI);

        const waveFrames = [];
        const waveAnim = new BABYLON.Animation(
            "waveVertical", 
            "scalingDeterminant", 
            this.FPS, 
            BABYLON.Animation.ANIMATIONTYPE_FLOAT, 
            BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
        )
        waveFrames.push({frame: 0, value: 1})
        waveFrames.push({frame: this.FPS, value: 1.5})
        waveFrames.push({frame: this.FPS * 2, value: 1})
        waveAnim.setKeys(waveFrames);
        mark.animations.push(waveAnim);

        const colorSwitchFrames = [];
        const colorSwitchAnim = new BABYLON.Animation(
            "colorSwitch", 
            "material.emissiveColor", 
            this.FPS, 
            BABYLON.Animation.ANIMATIONTYPE_COLOR3, 
            BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
        )
        colorSwitchFrames.push({frame: 0, value: Color3.Purple()})
        colorSwitchFrames.push({frame: this.FPS, value: Color3.Red()})
        colorSwitchFrames.push({frame: this.FPS * 2, value: Color3.Purple()})
        colorSwitchAnim.setKeys(colorSwitchFrames);
        mark.animations.push(colorSwitchAnim);
        mark.setEnabled(false);
        this._selectedMark = mark;
    }

    private getTexture(pathName: string, invertY: boolean = false): BABYLON.Texture {
        let existentTexture = this._scene.getTextureByName(pathName)
        return existentTexture as BABYLON.Texture || new BABYLON.Texture(pathName, this._scene, true, invertY);
    }

    private setupProjectile() {
        const material = new BABYLON.StandardMaterial("mat", this._scene);
        material.ambientTexture = this.getTexture("combat/fireDiffuse.png");;
        material.emissiveColor = new Color3(1, 0.2, 0);
        material.bumpTexture = this.getTexture("combat/bumpTexture.jpg");
        material.roughness = 1;
        let projetile = BABYLON.MeshBuilder.CreateSphere("projectile", {diameter: 0.5}, this._scene);
        projetile.material = material;
        projetile.isPickable = false;
        projetile.setEnabled(false);
        projetile.checkCollisions = true;
        this._projetile = projetile;

        const particleSystem = new BABYLON.ParticleSystem('particles', 1000, this._scene);
        particleSystem.emitter = projetile;
        particleSystem.emitRate = 50;
        particleSystem.particleTexture = this.getTexture('combat/fireDiffuse.png');
        particleSystem.minSize = 0.1;
        particleSystem.maxSize = 0.25;
        particleSystem.color1 = new BABYLON.Color4(1, 0.5, 0, 0.5); // Start color
        particleSystem.color2 = new BABYLON.Color4(1, 1, 0, 0.5); // End color
        particleSystem.minLifeTime = 1;
        particleSystem.maxLifeTime = 2;

        let projetileSword = BABYLON.MeshBuilder.CreatePlane(
            "box", {
                width: 0.2, 
                height: this.arcadiansSize.height, 
                // depth: 0.5
            }, this._scene);
        projetileSword.visibility = 0;
        projetileSword.isPickable = false;
        projetileSword.setEnabled(false);
        projetileSword.checkCollisions = true;
        this._projetileSword = projetileSword;
    }

    private getTags(mesh: Mesh) : string[] {
        return BABYLON.Tags.GetTags(mesh) || [];
    }

    private getFaction(character: Mesh): string {
        const tags = this.getTags(character);
        const factions = ["black", "white"];
        for (const faction of factions) {
            if (tags.includes(faction)) {
                return faction
            }
        }
    }

    private getEnemyFaction(faction: string): string {
        return ["black", "white"].find((v)=>v!=faction)
    }

    private castSpell(attacker: Mesh, weapon: Weapon): boolean {
        let targets: Mesh[] = this.getSpellTargets(attacker, weapon);

        if (targets.length == 0) {
            return false;
        }

        if (weapon.frostDuration > 0) {
            this.applyFrostEffect(targets, weapon.frostDuration, attacker.position);
        }

        if (weapon.burnTotalDamage > 0) {
            this.applyBurnEffect(targets, weapon.burnDuration, weapon.burnTotalDamage, attacker.position)
        }

        if (weapon.specialSpellType == "heal") {
            this.applyHealEffect(targets, weapon.spellAmount, attacker.position)
        }

        if (weapon.specialSpellType == "increaseArmor") {
            this.updateArmor(targets, weapon.spellAmount, attacker.position)
        }

        if (weapon.specialSpellType == "increaseMagicResist") {
            this.updateMagicResist(targets, weapon.spellAmount, attacker.position)
        }

        if (weapon.specialSpellType == "convert") {
            this.convertTarget(targets, weapon.spellAmount, attacker.position);
        }

        let animationName = this.getAttackAnimation(weapon);
        const animation = this.getGroupAnimation(attacker.uniqueId, animationName);
        animation.start(false);
        return true;
    }

    // SpriteManager
                // const spriteManager = new BABYLON.SpriteManager("sm", "spritesheets/hearth.png", 5, 512, this._scene);
                // var sprite = new BABYLON.Sprite("sprite", spriteManager);
                // sprite.size = 1;
                // sprite.position = attacker.position.add(new Vector3(0,0,0.1));
                // sprite.disposeWhenFinishedAnimating = true;
                // sprite.playAnimation(0, 5, false, 70);

    // x lifesteal
    // x add animations for sword slash & explosion
    // chain lightening
    // shield: block next attack
    // x fix hp bar also inverting on direction change
    // replace projectile particle for air asset
    // add projectiles assets 

    private shootWeapon(attacker: Mesh, weapon: Weapon): boolean {
        const target = this.getNearestVisibleTarget(attacker);
        const attackDirection = target.position.subtract(attacker.position).scale(1.15); // TODO: factor to compensate unkown bias
        const distance = attackDirection.length();
        if (weapon.range < distance) {
            return false;
        }

        const horizontalDirection = Math.sign(target.position.x - attacker.position.x)
        const projectileStartPosition = attacker.position.add(
            new Vector3(horizontalDirection * this.arcadiansSize.width* (3/4), 0, 0)
        );
        this.faceDirection(attacker, target.position);
        
        // attack animation
        let animationName = this.getAttackAnimation(weapon);
        const animation = this.getGroupAnimation(attacker.uniqueId, animationName);
        animation.start(false);

        // Create projectile
        let projectile: Mesh;
        let delayProjectile: number;
        if (weapon.type == 'gun') {
            projectile = this._projetile.clone("projectileClone");
            projectile.position = projectileStartPosition.add(new Vector3(0, 1, 0));
            delayProjectile = 300;
        } else if (weapon.type == "melee") {
            projectile = this._projetileSword.clone("projectileSwordClone");
            projectile.position = projectileStartPosition.clone();
            delayProjectile = 150;
        }
        
        projectile.physicsImpostor = new BABYLON.PhysicsImpostor(
            projectile, 
            BABYLON.PhysicsImpostor.BoxImpostor, {
                mass: weapon.projectileWeight, 
                restitution: 0.1, 
                friction: 0
            }
        );

        let collidedUniqueIds = [];
        const onHit = (collider: BABYLON.PhysicsImpostor, collidedAgainst: BABYLON.PhysicsImpostor) => {
            const collidedMesh = collidedAgainst.object as Mesh;
            
            if (collidedUniqueIds.includes(collidedMesh.uniqueId)) {
                return;
            }
            
            this.stopParticlesSystem(projectile);
            projectile.dispose();

            const hitMeshes: Mesh[] = [];
            if (weapon.radiusArea > 0) {
                for (let i = 0; i < enemies.length; i++) {
                    const distance = projectile.position.subtract(enemies[i].position).length();
                    if (distance < weapon.radiusArea) {
                        hitMeshes.push(enemies[i])
                    }
                }
                if (weapon.type == "gun") {
                    this.animateExplosion(projectile.position, weapon.radiusArea);
                }
            } else {
                hitMeshes.push(collidedMesh)
            }
            // Filter so only in the alive characters are applied effects like frost, fire, etc.
            const meshesToApplyEffects: Mesh[] = [];
            let damageInflictedTotal = 0;
            for (const hitMesh of hitMeshes) {
                collidedUniqueIds.push(hitMesh.uniqueId);
                const effectiveDamage = this.getEffectiveDamage(weapon.magicDamage, weapon.physicalDamage, hitMesh);
                damageInflictedTotal += effectiveDamage;
                const updatedHp = this.updateHp(hitMesh, -effectiveDamage);
                if (updatedHp > 0) {
                    meshesToApplyEffects.push(hitMesh);
                }
            }
            if (meshesToApplyEffects.length == 0) {
                return
            }
            if (weapon.frostDuration > 0) {
                this.applyFrostEffect(meshesToApplyEffects, weapon.frostDuration, attacker.position);
            }
            if (weapon.burnTotalDamage > 0) {
                damageInflictedTotal += this.applyBurnEffect(meshesToApplyEffects, weapon.burnDuration, weapon.burnTotalDamage, attacker.position)
            }
            if (weapon.lifesteal > 0) {
                const lifestealAmount = damageInflictedTotal*(weapon.lifesteal/100);
                this.applyHealEffect([attacker], lifestealAmount);
            }
        };

        const enemies = this.getEnemies(attacker);
        const physicsImpostors = enemies.map((v: Mesh)=>v.physicsImpostor);
        projectile.physicsImpostor.registerOnPhysicsCollide(physicsImpostors, onHit);

        setTimeout(() => {
            projectile.setEnabled(true);

            if (weapon.type == 'gun') {
                let time = distance / weapon.projectileSpeed;
                const forceX = attackDirection.x / time;
                const forceY = target.position.y + attackDirection.y / time - this.GRAVITY * time * (1/2);
                const forceZ = attackDirection.z / time;
                const impulse = new Vector3(forceX, forceY, forceZ).scale(weapon.projectileWeight);

                projectile.physicsImpostor.applyImpulse(impulse, projectile.getAbsolutePosition());
                projectile.physicsImpostor.setAngularVelocity(Vector3.One().scale(2))

                
                new BABYLON.Sound("fireGrenade", "sounds/Fire Grenade.wav", this._scene, null, {autoplay: true, volume: this.getVolume(projectile.position), maxDistance: this.MAX_SOUND_DISTANCE})

            } else if (weapon.type == "melee") {
                const direction = BABYLON.Vector3.Normalize(attackDirection);
                const impulse = direction.scale(weapon.projectileWeight).scale(weapon.projectileSpeed);
                projectile.physicsImpostor.applyImpulse(impulse, projectile.getAbsolutePosition());

                const lifeTime = weapon.range / weapon.projectileSpeed;
                setTimeout(() => {
                    projectile.dispose();
                }, 1000 * lifeTime);

                this.animateMeleeSlash(attacker, projectile.position);

                new BABYLON.Sound("sword", "sounds/Sword.wav", this._scene, null, {autoplay: true, volume: this.getVolume(projectile.position), maxDistance: this.MAX_SOUND_DISTANCE})
            }
        }, delayProjectile);
        
        return true;
    }

    private useWeapon(attackerUniqueId: number) {

        const attacker = this.getRootMesh(attackerUniqueId);
        const tags = BABYLON.Tags.GetTags(attacker) || [];
        if (tags.includes("attacking") || tags.includes("frost")) {
            return;
        }

        const weapons: Weapon[] = this.getEquippedWeapons(attackerUniqueId);
        for (let i = 0; i < weapons.length; i++) {
            const weapon = weapons[i];
            let attacked = false;
            if (weapon.type == "spell") {
                attacked = this.castSpell(attacker, weapon);
            } else if (weapon.type == 'gun' || weapon.type == "melee") {
                attacked = this.shootWeapon(attacker, weapon);
            }
            if (!attacked) {
                continue;
            }
            BABYLON.Tags.AddTagsTo(attacker, "attacking")
            setTimeout(() => {
                BABYLON.Tags.RemoveTagsFrom(attacker, "attacking")
            }, weapon.reloadTime * 1000);
        }
    }

    private convertTarget(targets: Mesh[], durationSeconds: number, soundOrigin: Vector3) {
        new BABYLON.Sound("convert", "sounds/curse.ogg", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})

        const particleSystem = new BABYLON.ParticleSystem('convertEffect', 300, this._scene);
        particleSystem.particleTexture = this.getTexture('combat/mindControl.png', true);
        particleSystem.emitRate = 5;
        particleSystem.minSize = 0.5;
        particleSystem.maxSize = 0.8;
        particleSystem.minLifeTime = 1;
        particleSystem.maxLifeTime = 2;
        particleSystem.disposeOnStop = true;

        for (const target of targets) {
            const particleSystemClone = particleSystem.clone("convertEffectClone", target)
            particleSystemClone.start();
            
            const faction = this.getFaction(target);
            const enemyFaction = this.getEnemyFaction(faction);
            BABYLON.Tags.RemoveTagsFrom(target, faction);
            BABYLON.Tags.AddTagsTo(target, enemyFaction);
    
            setTimeout(() => {
                BABYLON.Tags.RemoveTagsFrom(target, enemyFaction);
                BABYLON.Tags.AddTagsTo(target, faction);

                particleSystemClone.stop();
            }, durationSeconds*1000);
        }
        particleSystem.dispose(false);
    }

    private applyHealEffect(targets: Mesh[], amountToHeal: number, soundOrigin: Vector3 = null) {
        for (const target of targets) {
            this.updateHp(target, amountToHeal, false);
        }
        if (soundOrigin) {
            new BABYLON.Sound("heal", "sounds/heal.ogg", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})
        }
    }

    private applyBurnEffect(targets: Mesh[], durationSeconds: number, totalDamage: number, soundOrigin: Vector3): number {
        const particleSystem = new BABYLON.ParticleSystem('burnEffect', 300, this._scene);
        particleSystem.emitRate = 50;
        particleSystem.minSize = 0.2;
        particleSystem.maxSize = 0.6;
        particleSystem.minLifeTime = 1;
        particleSystem.maxLifeTime = 2;
        
        particleSystem.isAnimationSheetEnabled = true;
        particleSystem.particleTexture = this.getTexture('combat/fire1_64.png');
        particleSystem.spriteCellHeight = 64;
        particleSystem.spriteCellWidth = 64;
        particleSystem.startSpriteCellID = 0;
        particleSystem.endSpriteCellID = 59;
        particleSystem.spriteCellChangeSpeed = 4;
        particleSystem.spriteRandomStartCell = true;
        particleSystem.disposeOnStop = true;

        new BABYLON.Sound("burn", "sounds/burn.wav", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})

        let effectiveDamageTotal = 0;
        for (const target of targets) {
            let numberTicks = durationSeconds * (1000 / 100);
            // burn damage is considered physical
            const effectiveDamage = this.getEffectiveDamage(totalDamage, 0, target);
            effectiveDamageTotal += effectiveDamage;
            const burnPerTick = effectiveDamage / numberTicks;

            const particleSystemClone = particleSystem.clone("particleSystemClone", target)
            particleSystemClone.start();

            const burnInterval = setInterval(()=>{
                const newHp = this.updateHp(target, -burnPerTick, false);
                if (numberTicks === 0 || newHp === 0) {
                    particleSystemClone.stop();
                    clearInterval(burnInterval)
                }
                numberTicks--;
            }, 100)
        }
        particleSystem.dispose(false);
        return effectiveDamageTotal;
    }

    private applyFrostEffect(targets: Mesh[], durationSeconds: number, soundOrigin: Vector3) {
        const particleSystem = new BABYLON.ParticleSystem('frostEffect', 300, this._scene);
        particleSystem.emitRate = 30;
        particleSystem.minSize = 0.2;
        particleSystem.maxSize = 0.4;
        particleSystem.minLifeTime = 1;
        particleSystem.maxLifeTime = 2;
        particleSystem.color1 = new BABYLON.Color4(0, 0, 1, 0.5);
        particleSystem.color2 = new BABYLON.Color4(1, 1, 1, 0.5);

        particleSystem.isAnimationSheetEnabled = true;
        particleSystem.particleTexture = this.getTexture('spritesheets/frost.png');
        particleSystem.spriteCellHeight = 184.4;
        particleSystem.spriteCellWidth = 187.4;
        particleSystem.startSpriteCellID = 0;
        particleSystem.endSpriteCellID = 5 * 7 -1;
        particleSystem.spriteCellChangeSpeed = 4;
        particleSystem.spriteRandomStartCell = true;
        particleSystem.disposeOnStop = true;

        new BABYLON.Sound("freeze", "sounds/freeze.wav", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})

        for (const target of targets) {
            const particleSystemClone = particleSystem.clone("particleSystemClone", target)
            particleSystemClone.start();
    
            BABYLON.Tags.AddTagsTo(target, "frost");
    
            this.stopGroupAnimations(target.uniqueId);
            setTimeout(() => {
                const tags = BABYLON.Tags.GetTags(target) || [];
                if (!tags.includes("dead")) {
                    this.getGroupAnimation(target.uniqueId, ANIMATION_LIST.idle).start(true);
                }
                
                BABYLON.Tags.RemoveTagsFrom(target, "frost");
                particleSystemClone.stop();
            }, durationSeconds * 1000);
        }
        particleSystem.dispose(false);
    }

    private getEffectiveDamage(magicDamage: number, physicalDamage: number, target: Mesh) {
        const metadata: CharacterMetadata = JSON.parse(target.metadata)
        const magicResist = metadata.magicResist; 
        const armor = metadata.armor;
        const damage = (magicDamage * (1 - magicResist/100)) + (physicalDamage * (1 - armor/100));
        return damage;
    }

    private setupSpriteManagers() {
        new BABYLON.SpriteManager("explosion", "spritesheets/explosion.png", 15, 192, this._scene);
        new BABYLON.SpriteManager("swordSlash", "spritesheets/swordSlash.png", 6, 400, this._scene);
    }

    private getSpriteManager(name: string): BABYLON.ISpriteManager {
        return this._scene.spriteManagers.find((sp)=>sp.name == name)
    }

    private animateMeleeSlash(attacker: Mesh, attackStartPosition: Vector3, color: BABYLON.Color4 = undefined) {
        const horizontalDirection = Math.sign(attacker.position.x - attackStartPosition.x)
        const boundingInfo = attacker.getBoundingInfo();

        const spriteManager = this.getSpriteManager("swordSlash")
        const sprite = new BABYLON.Sprite("sprite", spriteManager);
        sprite.invertU = horizontalDirection == 1 ? false : true;
        sprite.size = boundingInfo.maximum.y * 3;
        sprite.position = attackStartPosition.add(new Vector3(-horizontalDirection*boundingInfo.maximum.x*2,0,0.1));
        sprite.disposeWhenFinishedAnimating = true;
        if (color) {
            sprite.color = color;
        }
        sprite.playAnimation(0, 5, false, 50);
    }

    private animateExplosion(position: Vector3, radius: number, color: BABYLON.Color4 = undefined) {
        const spriteManager = this.getSpriteManager("explosion")
        const sprite = new BABYLON.Sprite("sprite", spriteManager);
        sprite.size = radius*1.5; // value to compensate image transparent borders
        sprite.position = position.add(new Vector3(0,0,0.1));
        sprite.disposeWhenFinishedAnimating = true;
        if (color) {
            sprite.color = color;
        }
        sprite.playAnimation(0, 5, false, 50);
    }

    private getAttackAnimation(weapon: Weapon): string {
        switch (weapon.type) {
            case "spell":
                return ANIMATION_LIST.attackWizard;
            case "gun":
                return ANIMATION_LIST.attackGunner;
            case "melee":
                const isRightHandWeapon = weapon.slotName == slotsNames.rightHand;
                return isRightHandWeapon ? ANIMATION_LIST.attackKnight : ANIMATION_LIST.attackAssassin;
            default:
                return ANIMATION_LIST.attackTech;
        }
    }

    private stopParticlesSystem(mesh: Mesh) {
        const particleSystems = mesh.getConnectedParticleSystems()
        for (let i = 0; i < particleSystems.length; i++) {
            particleSystems[i].disposeOnStop = true;
            particleSystems[i].stop();
        }
    }

    // Returns the equipped weapons ordered by damage
    private getEquippedWeapons(characterUniqueId: number): Weapon[] {
        return [slotsNames.rightHand, slotsNames.leftHand]
            .map((slotName) => ({slotName: slotName, material: this._scene.getMaterialById(this.getItemMaterialId(characterUniqueId, slotName))}))
            .filter((resp) => !!resp?.material)
            .map((resp) => {
                const weapon = this.weaponsList.find((weapon) => weapon.name == resp.material.metadata)
                weapon.slotName = resp.slotName
                return weapon;
            })
            .sort((a, b)=> (b.magicDamage + b.physicalDamage) - (a.magicDamage + a.physicalDamage))
    }
    
    private getSpellTargets(attacker: Mesh, weapon: Weapon): Mesh[] {
        const isDefensiveSpell = ["heal", "increaseArmor", "increaseMagicResist"].includes(weapon.specialSpellType);
        const possibleTargets = isDefensiveSpell ? this.getAllies(attacker) : this.getEnemies(attacker);
        if (!possibleTargets || possibleTargets.length == 0) {
            return;
        }
        possibleTargets.sort((a, b)=>a.position.subtract(attacker.position).length() - b.position.subtract(attacker.position).length())

        const targets: Mesh[] = [];
        for (let i = 0; i < possibleTargets.length; i++) {
            const target = possibleTargets[i];
            const deltaPosition = target.position.subtract(attacker.position);
            if (deltaPosition.length() > (weapon.spellRange)) {
                continue;
            }
            if (weapon.specialSpellType == "heal" && this.getHpPercentage(target) == 100) {
                continue;
            }
            targets.push(target);
            if (targets.length > weapon.spellMaxTargets) {
                break;
            }
        }
        return targets;
    }

    private getAllies(character: Mesh) {
        const allyFaction = this.getFaction(character);
        return this._scene.getMeshesByTags(`${allyFaction} && !dead`);
    }

    private getEnemies(attacker: Mesh) {
        const enemyFaction = this.getEnemyFaction(this.getFaction(attacker));
        return this._scene.getMeshesByTags(`${enemyFaction} && !dead`);
    }

    private getNearestVisibleTarget(attacker: Mesh): Mesh {
        const targets = this.getEnemies(attacker);
        if (!targets || targets.length == 0) {
            return;
        }
        targets.sort((a, b)=>a.position.subtract(attacker.position).length() - b.position.subtract(attacker.position).length())

        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            const deltaPosition = target.position.subtract(attacker.position);

            const origin = attacker.position;
            const ray = new BABYLON.Ray(origin, deltaPosition);
            
            // let rayHelper = new BABYLON.RayHelper(ray);		
            // rayHelper.show(this._scene);
            attacker.isPickable = false;
            const hit = this._scene.pickWithRay(ray);
            attacker.isPickable = true;

            if (targets.some((t)=>t.uniqueId == hit.pickedMesh?.uniqueId)) {
                return hit.pickedMesh as Mesh;
            }
        }
    }

    private setupHitEffect() {
        const hitStarMesh = BABYLON.CreatePlane("hitStarMesh_original", {width: 1, height: 1}, this._scene);
        const hitMaterial = new BABYLON.StandardMaterial("hitStart", this._scene);
        hitMaterial.emissiveColor = Color3.Red();
        const hitTexture = this.getTexture("combat/explosionEffect.png");
        hitTexture.hasAlpha = true;
        hitMaterial.diffuseTexture = hitTexture;
        hitStarMesh.material = hitMaterial;
        hitStarMesh.rotate(new Vector3(0,1,0), Math.PI);
        hitStarMesh.setEnabled(false);
    }

    private setupHpBar() {
        const materialMaxHp = new BABYLON.StandardMaterial("materialMaxHp", this._scene);
        materialMaxHp.diffuseColor = Color3.Red();
        const hpBarMax = BABYLON.CreatePlane("maxHpBar_original", {width: 1, height: 0.3})
        hpBarMax.material = materialMaxHp;
        hpBarMax.rotate(new Vector3(0,1,0), Math.PI);
        hpBarMax.setEnabled(false);

        const materialHp = new BABYLON.StandardMaterial("materialHp", this._scene);
        materialHp.diffuseColor = Color3.Blue();
        const hpBar = BABYLON.CreatePlane("hpBar_original", {width: 1, height: 0.3})
        hpBar.material = materialHp;
        hpBar.setEnabled(false);
        hpBar.rotate(new Vector3(0,1,0), Math.PI);
    }

    private createHpBar(parent: Mesh, maxHp: number) {
        const boundingInfo = parent.getBoundingInfo();
        const hpBarMax = this._scene.getMeshByName("maxHpBar_original").clone("maxHpBar", parent);
        hpBarMax.position.y += boundingInfo.maximum.y + 0.5;
        hpBarMax.metadata = maxHp;
        hpBarMax.setEnabled(true);
        const hpBar = this._scene.getMeshByName("hpBar_original").clone("hpBar", parent);
        hpBar.position.y += boundingInfo.maximum.y + 0.5;
        hpBar.position.z += 0.01;
        hpBar.metadata = maxHp;
        hpBar.setEnabled(true);
    }

    private getHpPercentage(characterMesh: Mesh) {
        const hpBar = characterMesh.getChildMeshes(true, (node)=>node.name == "hpBar")[0] as Mesh;
        const currentHp = Number(hpBar.metadata);
        const hpBarMax = characterMesh.getChildMeshes(true, (node)=>node.name == "maxHpBar")[0] as Mesh;
        const maxHp = Number(hpBarMax.metadata);
        return 100 * currentHp / maxHp;
    }

    private updateMagicResist(targets: Mesh[], deltaArmor: number, soundOrigin: Vector3) {
        new BABYLON.Sound("increaseMagicResist", "sounds/enchant.ogg", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})

        for (const target of targets) {
            const meta: CharacterMetadata = JSON.parse(target.metadata)
            meta.magicResist += deltaArmor;
            target.metadata = JSON.stringify(meta);
    
            const particleSystem = new BABYLON.ParticleSystem('increaseMagicResist', 300, this._scene);
            particleSystem.particleTexture = this.getTexture('combat/shield.png', true);
            particleSystem.emitter = target;
            particleSystem.emitRate = 30;
            particleSystem.minSize = 0.2;
            particleSystem.maxSize = 0.4;
            particleSystem.minLifeTime = 1;
            particleSystem.maxLifeTime = 2;
            const color = new BABYLON.Color4(0.8,0.8,0, 1);
            particleSystem.color1 = color;
            particleSystem.color2 = color;
            particleSystem.start();
    
            setTimeout(() => {
                particleSystem.stop();
            }, 1000);
        }
    }

    private updateArmor(targets: Mesh[], deltaArmor: number, soundOrigin: Vector3) {
        new BABYLON.Sound("increaseArmor", "sounds/enchant2.ogg", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})

        for (const target of targets) {
            const meta: CharacterMetadata = JSON.parse(target.metadata)
            meta.armor += deltaArmor;
            target.metadata = JSON.stringify(meta);
    
            const particleSystem = new BABYLON.ParticleSystem('increaseArmor', 300, this._scene);
            particleSystem.particleTexture = this.getTexture('combat/shield.png', true);
            particleSystem.emitter = target;
            particleSystem.emitRate = 30;
            particleSystem.minSize = 0.2;
            particleSystem.maxSize = 0.4;
            particleSystem.minLifeTime = 1;
            particleSystem.maxLifeTime = 2;
            const color = new BABYLON.Color4(0,0.5,1, 1);
            particleSystem.color1 = color;
            particleSystem.color2 = color;
            particleSystem.start();
    
            setTimeout(() => {
                particleSystem.stop();
            }, 1000);
        }
    }

    private updateHp(target: Mesh, deltaHp: number, animateHit: boolean = true): number {
        if (this.getTags(target).includes("dead")) {
            return 0;
        }
        const hpBar = target.getChildMeshes(true, (node)=>node.name == "hpBar")[0] as Mesh;
        const hpBarMax = target.getChildMeshes(true, (node)=>node.name == "maxHpBar")[0] as Mesh;
        const maxHp = Number(hpBarMax.metadata);
        const currentHp = Number(hpBar.metadata);
        const updatedHp = Math.max(Math.min(currentHp + deltaHp, maxHp), 0);
        deltaHp = updatedHp - currentHp;
        if (updatedHp == 0) {
            this.stopGroupAnimations(target.uniqueId);
            const animation = this.getGroupAnimation(target.uniqueId, ANIMATION_LIST.death);
            animation.start(false);
            target.physicsImpostor.dispose();
            target.isPickable = false;
            hpBar.dispose();
            hpBarMax.dispose();
            
            BABYLON.Tags.AddTagsTo(target, "dead");
            BABYLON.Tags.RemoveTagsFrom(target, "arcadian");

            new BABYLON.Sound("hit", "sounds/die.mp3", this._scene, null, {autoplay: true, volume: this.getVolume(target.position), maxDistance: this.MAX_SOUND_DISTANCE})
        } else if (deltaHp < 0 && animateHit) {
            const animation = this.getGroupAnimation(target.uniqueId, ANIMATION_LIST.hit);
            animation.start(false);

            const hitSounds = ["hit1.mp3", "hit4.mp3", "hit5.mp3"];
            const randomHitSound = hitSounds[Math.floor(Math.random()*(hitSounds.length-1))]
            new BABYLON.Sound("die", "sounds/"+randomHitSound, this._scene, null, {autoplay: true, volume: this.getVolume(target.position), maxDistance: this.MAX_SOUND_DISTANCE})
        } else if (deltaHp > 0) {

            const particleSystem = new BABYLON.ParticleSystem('healEffect', 300, this._scene);
            particleSystem.emitter = target;
            particleSystem.emitRate = 30;
            particleSystem.minSize = 0.2;
            particleSystem.maxSize = 0.4;
            particleSystem.minLifeTime = 1;
            particleSystem.maxLifeTime = 2;

            particleSystem.isAnimationSheetEnabled = true;
            particleSystem.particleTexture = this.getTexture('spritesheets/hearth.png');
            particleSystem.spriteCellHeight = 512;
            particleSystem.spriteCellWidth = 512;
            particleSystem.startSpriteCellID = 0;
            particleSystem.endSpriteCellID = 5*1 - 1;
            particleSystem.spriteCellChangeSpeed = 4;
            particleSystem.spriteRandomStartCell = true;
            particleSystem.color1 = new BABYLON.Color4(0,1,0,1);
            particleSystem.color2 = new BABYLON.Color4(0,1,0,1);
            particleSystem.start();
            setTimeout(() => {
                particleSystem.stop();
            }, 1000);
        }
        const maxHpBarWidth = 1;
        hpBar.position.x -= (deltaHp / maxHp * maxHpBarWidth) / 2;
        hpBar.scaling.x = updatedHp / maxHp;
        hpBar.metadata = updatedHp;
        return updatedHp;
    }

    private getVolume(sourcePosition: Vector3) {
        return 1 - this._scene.cameras[0].position.subtract(sourcePosition).length()/this.MAX_SOUND_DISTANCE
    }

    private async loadArcadian(arcadianId: number, position: Vector3 = Vector3.Zero()) {
        
        const metadataUrl = "https://arcadians.prod.outplay.games/v2/arcadians/" + arcadianId;
        const metadata = await fetch(metadataUrl).then((result)=>result.json())
        const attributes: MetadataSlot[] = metadata.attributes;

        // body to detect interactions
        let root = BABYLON.MeshBuilder.CreateCylinder("root", {diameter: this.arcadiansSize.width, height: this.arcadiansSize.height});
        // TODO: set magic resist and armor based on the items equipped
        const characterMetadata: CharacterMetadata = {
            magicResist: 10,
            armor: 5,
        }
        root.metadata = JSON.stringify(characterMetadata);
        root.name = "arcadian_" + arcadianId;
        BABYLON.Tags.AddTagsTo(root, "arcadian");
        BABYLON.Tags.AddTagsTo(root, ["black", "white"][Math.floor(Math.random()*2)]);
        root.visibility = 0;
        root.position = position;
        root.physicsImpostor = new BABYLON.PhysicsImpostor(root, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 70, restitution: 0.3, friction: 0.3});
        root.physicsImpostor.physicsBody.angularDamping = 1;
        root.checkCollisions = true;
        const nodeUniqueId = root.uniqueId;
        const {meshes, animationGroups} = await SceneLoader.ImportMeshAsync(null, "ArcadianAvatar", ".gltf", this._scene);
        const body = meshes[0];
        animationGroups[0].stop();
        body.setParent(root);
        body.name = "body";
        body.position = new Vector3(0, -this.arcadiansSize.height/2, 0);
        body.isPickable = false;

        const childMeshes = body.getChildMeshes();
        for (const childMesh of childMeshes) {
            childMesh.isPickable = false;
        }
        for (const group of animationGroups) {
            group.name = root.uniqueId + this.SEPARATOR + group.name
        }

        for (const att of attributes) {
            const slotName = att.trait_type;
            
            if (slotName == slotsNames.class || slotName == slotsNames.gender || slotName == slotsNames.background) 
                continue;

            const itemsSlot = this._stack.find((v)=>v.name == slotName)
            const itemSlot = itemsSlot.layer.find((v)=>v.name == att.value)

            const itemFilename = itemSlot.src.split("/")[1];
            const itemPath = "parts/" + itemFilename;
            const blankPath = "empty399x399.png";
            const textureImage = await mergeImages([blankPath, {src: itemPath, x: itemSlot.x, y: itemSlot.y}]);
            let texture = this.getTexture(textureImage);

            texture.name = itemFilename;
            texture.hasAlpha = true;

            const material = childMeshes.find((mesh)=>mesh.material.id == slotName).material
            material.id = nodeUniqueId + this.SEPARATOR + slotName;

            (material as any).albedoTexture = texture;
            material.name = slotName;

            if (slotName == slotsNames.rightHand || slotName == slotsNames.leftHand) {
                material.metadata = att.value.slice(0,-2) || "";
            } else {
                material.metadata = att.value || "";
            }
        }

        // Set hp bars
        const maxHp = 100;
        this.createHpBar(root, maxHp);

        root.actionManager = new BABYLON.ActionManager(this._scene);
        root.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                    trigger: BABYLON.ActionManager.OnPickDownTrigger,
                },
                () => {}
            )
        )

        const animation = this.getGroupAnimation(nodeUniqueId, ANIMATION_LIST.idle);
        animation.start(true);
    }

    private faceDirection(character: Mesh, pointToLook: Vector3) {
        const horizontalDirection = Math.sign(pointToLook.x - character.position.x) // -1 | 1
        const characterMesh = character.getChildMeshes(true, (node)=>node.name == "body")[0]
        if (characterMesh.scaling.x == horizontalDirection) {
            characterMesh.scaling.x = -horizontalDirection;
        }
    }

    private moveCharacter(nodeUniqueId: number, destination: Vector3) {
        const characterMesh = this.getRootMesh(nodeUniqueId);
        
        const tags = BABYLON.Tags.GetTags(characterMesh) || [];
        if (tags.includes("frost")) {
            return;
        }
        destination.y = characterMesh.position.y;
        // TODO: speed should come from equippments
        const speed = 4;
        let distance = destination.subtract(characterMesh.position);

        this.faceDirection(characterMesh, destination);

        const animationName = "moveAnimation";
        var animation = new BABYLON.Animation(
            animationName,
            "position",
            this.FPS,
            BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
        );

        const totalFrames = this.FPS * distance.length() / speed;
        var keys = [
            { frame: 0, value: characterMesh.position },
            { frame: totalFrames, value: destination }
        ];
        animation.setKeys(keys);

        characterMesh.animations.push(animation);

        this._scene.stopAnimation(characterMesh, animationName);

        const groupAnimation = this.getGroupAnimation(nodeUniqueId, ANIMATION_LIST.walk);
        groupAnimation.start(true);

        this._scene.beginDirectAnimation(characterMesh, [animation], 0, totalFrames, false, 1, () => {
            this.stopGroupAnimations(nodeUniqueId);
            const animation = this.getGroupAnimation(nodeUniqueId, ANIMATION_LIST.idle);
            animation.start(true);
        })
    }

    private createTerrain() {
        // ground
        const groundTexture = this.getTexture("environment/stoneFloor.png");
        const groundBumpTexture = this.getTexture("environment/stoneFloorBump.png");
        groundTexture.hasAlpha = true;
        const scaleGround = 10;
        groundTexture.uScale = this.fieldFimensions.x/scaleGround;
        groundTexture.vScale = this.fieldFimensions.z/scaleGround;

        groundBumpTexture.hasAlpha = true;
        groundBumpTexture.uScale = this.fieldFimensions.x/scaleGround;
        groundBumpTexture.vScale = this.fieldFimensions.z/scaleGround;
        
        const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", this._scene);
        groundMaterial.ambientTexture = groundTexture;
        groundMaterial.bumpTexture = groundBumpTexture;
        
        const ground = BABYLON.MeshBuilder.CreateGround("ground", {width: this.fieldFimensions.x, height: this.fieldFimensions.z}, this._scene);
        ground.physicsImpostor = new BABYLON.PhysicsImpostor(ground, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.3});
        ground.position = new Vector3(this.fieldFimensions.x/2, 0.1, this.fieldFimensions.z/2);
        ground.metadata = "ground";
        ground.material = groundMaterial;
        
        // background
        const bgWidth = 1419;
        const bgHeight = 980;
        var background = BABYLON.MeshBuilder.CreatePlane("background", {width: bgWidth, height: bgHeight}, this._scene);
        background.scalingDeterminant = Math.round(window.innerWidth / 300);
        background.position = new Vector3(this.fieldFimensions.x/2, bgHeight/2.5, -bgWidth*2.5)
        background.isPickable = false;
        let backgroundMaterial = new BABYLON.StandardMaterial("bgMaterial", this._scene);
        backgroundMaterial.diffuseTexture = this.getTexture("bgMountain.jpg", true);
        background.material = backgroundMaterial;
        background.rotate(new Vector3(0,1,0), Math.PI);
    }

    private getRootMesh(nodeUniqueId: number): Mesh {
        return this._scene.rootNodes.find((v)=>v.uniqueId == nodeUniqueId) as Mesh;
    }
    private stopGroupAnimations(uniqueId: number) {
        const activeAnimations = this._scene.animationGroups.filter((v)=>v.isPlaying && v.name.split(this.SEPARATOR)[0] == uniqueId.toString());
        activeAnimations.forEach((v)=>v.stop())
    }
    private getGroupAnimation(uniqueId: number, animationName: string) {
        return this._scene.getAnimationGroupByName(this.getGroupAnimationName(uniqueId, animationName));
    }

    private getGroupAnimationName(animatedUniqueId: number, animationName: string): string {
        return animatedUniqueId + this.SEPARATOR + animationName
    }

    private getItemMaterialId(characterUniqueId: number, slotName: string): string {
        return characterUniqueId + this.SEPARATOR + slotName;
    }

    private async createScene() {
        // initialize babylon scene and engine
        this._engine = new Engine(this._canvas, true);
        this._scene = new Scene(this._engine);

        var light1: HemisphericLight = new HemisphericLight("light1", new Vector3(this.fieldFimensions.x, this.fieldFimensions.x, this.fieldFimensions.z), this._scene);
        // var light1 = new BABYLON.DirectionalLight("DirectionalLight", new BABYLON.Vector3(0, -1, -1), this._scene);
        light1.intensity = 2;
        const cameraY = 6;
        let camera = new FreeCamera("camera1", new Vector3(this.fieldFimensions.x/2, cameraY, this.fieldFimensions.z-15), this._scene);
        camera.minZ = 1;
        camera.setTarget(new Vector3(this.fieldFimensions.x/2, 0, this.fieldFimensions.z * 1/4))
        camera.attachControl(this._canvas, true);
        camera.inputs.removeMouse();

        // Keeps the camera position within bounds
        this._scene.registerBeforeRender(()=>{
            const marginX = this.fieldFimensions.z/2;
            const marginZ = 40;
            camera.position.x = Math.min(Math.max(camera.position.x, marginX), this.fieldFimensions.x - marginX);
            camera.position.y = cameraY;
            camera.position.z = Math.min(Math.max(camera.position.z, marginZ), this.fieldFimensions.z);
        })

        this._scene.gravity = new Vector3(0, this.GRAVITY / this.FPS, 0);
        this._scene.collisionsEnabled = true;
        this._scene.enablePhysics(new Vector3(0, this.GRAVITY, 0), new BABYLON.CannonJSPlugin(true, 10, CANNON));
    }

    private _createCanvas(): HTMLCanvasElement {

        //Commented out for development
        document.documentElement.style["overflow"] = "hidden";
        document.documentElement.style.overflow = "hidden";
        document.documentElement.style.width = "100%";
        document.documentElement.style.height = "100%";
        document.documentElement.style.margin = "0";
        document.documentElement.style.padding = "0";
        document.body.style.overflow = "hidden";
        document.body.style.width = "100%";
        document.body.style.height = "100%";
        document.body.style.margin = "0";
        document.body.style.padding = "0";

        //create the canvas html element and attach it to the webpage
        this._canvas = document.createElement("canvas");
        this._canvas.style.width = "100%";
        this._canvas.style.height = "100%";
        this._canvas.id = "gameCanvas";
        document.body.appendChild(this._canvas);

        return this._canvas;
    }

    private async loadFilesToMemory() {
        this._stack = (await fetch("stack.json").then((res)=>res.json())).stack.stack.stack
        const weaponsList = (await fetch("weapons.json").then((res)=>res.json()))
        this.weaponsList = weaponsList.map((weapon)=> {
            return this.convertKeysToNumbers(weapon);
        })
    }
    private convertKeysToNumbers(obj: any) {
        const convertedObj = {};
        for (let key in obj) {
            const parsed = parseFloat(obj[key]);
            const numericKey = isNaN(parsed) ? obj[key] : parsed;
            convertedObj[key] = numericKey;
        }
        return convertedObj;
      }
}
new App();