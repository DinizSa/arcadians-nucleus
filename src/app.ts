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
    slotName?: string;
};

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
                } else if (pickInfo.pickedMesh.metadata == "arcadian") {
                    this.selectedCharacterId = pickInfo.pickedMesh.uniqueId;
                    this.startSelectedMarkAnim(this.selectedCharacterId);
                }
            }
        }

        window.addEventListener("keydown", (ev) => {
            if (ev.keyCode === 32) {
                if (this.selectedCharacterId) {
                    const target = this.getNearestAttackTarget(this.selectedCharacterId);
                    if (target) {
                        this.attackTarget(this.selectedCharacterId, target);
                    }
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

    private attackTarget(attackerUniqueId: number, target: Mesh) {
        const attacker = this.getRootMesh(attackerUniqueId);

        const tags = BABYLON.Tags.GetTags(attacker) || [];
        if (tags.includes("attacking") || tags.includes("frost")) {
            return;
        }

        const horizontalDirection = Math.sign(target.position.x - attacker.position.x) // -1 || 1
        const attackPosition = attacker.position.add(
            new Vector3(horizontalDirection * this.arcadiansSize.width* (3/4), 0, 0)
        );

        // scale to compensate unkown bias when aiming the projectile
        const attackDirection = target.position.subtract(attackPosition).scale(1.15);
        const distance = attackDirection.length();
        const weapons: Weapon[] = this.getEquippedWeapons(attackerUniqueId);

        let weapon: Weapon = weapons.find((weapon) => weapon?.range >= distance);
        if (!weapon){
            return false;
        }
        if (attacker.scaling.x == horizontalDirection) {
            attacker.scaling.x = -horizontalDirection;
        }
        
        // attack animation
        let animationName = this.getAttackAnimation(weapon);
        const animation = this.getGroupAnimation(attacker.uniqueId, animationName);
        animation.start(false);
        BABYLON.Tags.AddTagsTo(attacker, "attacking")
        setTimeout(() => {
            BABYLON.Tags.RemoveTagsFrom(attacker, "attacking")
        }, weapon.reloadTime * 1000);

        // Create projectile
        let projectile: Mesh;
        let delayProjectile: number;
        if (weapon.type == 'gun' || weapon.type == 'spell') {
            projectile = this._projetile.clone("projectileClone");
            projectile.position = attackPosition.add(new Vector3(0, 1, 0));
            delayProjectile = 300;
        } else if (weapon.type == "melee") {
            projectile = this._projetileSword.clone("projectileSwordClone");
            projectile.position = attackPosition.clone();
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
                const targets = this._scene.getMeshesByTags("arcadian").filter((v)=>v.uniqueId != attacker.uniqueId);

                for (let i = 0; i < targets.length; i++) {
                    const distance = projectile.position.subtract(targets[i].position).length();
                    if (distance < weapon.radiusArea) {
                        hitMeshes.push(targets[i])
                    }
                }
            } else if (collidedMesh.metadata == "arcadian") {
                hitMeshes.push(collidedMesh)
            }
            for (const hitMesh of hitMeshes) {

                const effectiveDamage = this.getEffectiveDamage(weapon.magicDamage, weapon.physicalDamage, hitMesh);
                const updatedHp = this.registerHit(hitMesh.uniqueId, effectiveDamage);
                collidedUniqueIds.push(hitMesh.uniqueId);

                if (updatedHp <= 0) {
                    return;
                }

                if (weapon.frostDuration > 0) {
                    const particleSystem = new BABYLON.ParticleSystem('frostEffect', 300, this._scene);
                    particleSystem.emitter = hitMesh;
                    particleSystem.emitRate = 30;
                    particleSystem.minSize = 0.2;
                    particleSystem.maxSize = 0.4;
                    particleSystem.minLifeTime = 1;
                    particleSystem.maxLifeTime = 2;
                    particleSystem.color1 = new BABYLON.Color4(0, 0, 1, 0.5);
                    particleSystem.color2 = new BABYLON.Color4(1, 1, 1, 0.5);
                    particleSystem.particleTexture = this.getTexture('combat/ice.jpg');
                    particleSystem.start();

                    BABYLON.Tags.AddTagsTo(hitMesh, "frost");

                    new BABYLON.Sound("freeze", "sounds/freeze.wav", this._scene, null, {autoplay: true, volume: this.getVolume(projectile.position)/2, maxDistance: this.MAX_SOUND_DISTANCE})

                    this.stopGroupAnimations(hitMesh.uniqueId);
                    setTimeout(() => {
                        const tags = BABYLON.Tags.GetTags(hitMesh) || [];
                        if (!tags.includes("dead")) {
                            this.getGroupAnimation(hitMesh.uniqueId, ANIMATION_LIST.idle).start(true);
                        }
                        
                        BABYLON.Tags.RemoveTagsFrom(hitMesh, "frost");
                        particleSystem.stop();
                    }, weapon.frostDuration * 1000);
                }

                if (weapon.burnTotalDamage > 0) {
                    const particleSystem = new BABYLON.ParticleSystem('burnEffect', 300, this._scene);
                    particleSystem.emitter = hitMesh;
                    particleSystem.emitRate = 30;
                    particleSystem.minSize = 0.2;
                    particleSystem.maxSize = 0.4;
                    particleSystem.minLifeTime = 1;
                    particleSystem.maxLifeTime = 2;
                    particleSystem.color1 = new BABYLON.Color4(1, 0.5, 0, 0.5);
                    particleSystem.color2 = new BABYLON.Color4(1, 1, 0, 0.5);
                    particleSystem.particleTexture = this.getTexture('combat/fireDiffuse.png');
                    particleSystem.start()

                    new BABYLON.Sound("burn", "sounds/burn.wav", this._scene, null, {autoplay: true, volume: this.getVolume(projectile.position)/2, maxDistance: this.MAX_SOUND_DISTANCE})

                    let numberTicks = weapon.burnDuration * (1000 / 100);
                    const burnPerTick = weapon.burnTotalDamage / numberTicks;
                    const burnInterval = setInterval(()=>{
                        const newHp = this.registerHit(hitMesh.uniqueId, burnPerTick, false);
                        if (numberTicks === 0 || newHp === 0) {
                            particleSystem.stop();
                            clearInterval(burnInterval)
                        }
                        numberTicks--;
                    }, 100)
                }
            }
            this.animateExplosion(collidedMesh, projectile.position, weapon.radiusArea);
        };
        const physicsImpostors = this._scene.rootNodes.filter((v)=>v.metadata == "arcadian" && attacker.uniqueId != v.uniqueId).map((v: Mesh)=>v.physicsImpostor);
        projectile.physicsImpostor.registerOnPhysicsCollide(physicsImpostors, onHit);

        setTimeout(() => {
            projectile.setEnabled(true);

            if (weapon.type == 'gun' || weapon.type == 'spell') {
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

                new BABYLON.Sound("sword", "sounds/Sword.wav", this._scene, null, {autoplay: true, volume: this.getVolume(projectile.position), maxDistance: this.MAX_SOUND_DISTANCE})
            }
        }, delayProjectile);
    }

    private getEffectiveDamage(magicDamage: number, physicalDamage: number, hitMesh: Mesh) {
        // TODO: get armor and magic resist from all the wereables
        const magicResist = 20; // percentage of magic damage ignored
        const armor = 10; // percentage or physical damage ignored
        const damage = (magicDamage * (1 - magicResist/100)) + (physicalDamage * (1 - armor/100));
        return damage;
    }

    private animateExplosion(target: Mesh, projectilePosition: Vector3, radius: number) {
        const boundingInfo = target.getBoundingInfo();
        const hitPosition = target.position.clone();
        const horizontalDirection = Math.sign(target.position.x - projectilePosition.x)
        hitPosition.x -= horizontalDirection * boundingInfo.maximum.x;
        hitPosition.y = projectilePosition.y;
        hitPosition.z += 0.1;

        const hitStarMesh = this._scene.getMeshByName("hitStarMesh_original").clone("hitStarMesh", undefined)
        hitStarMesh.setEnabled(true);
        hitStarMesh.position = hitPosition;
        hitStarMesh.scalingDeterminant = radius;

        // explosion animation
        const animationFrames = [];
        const animation = new BABYLON.Animation(
            "waveVertical", 
            "scalingDeterminant", 
            this.FPS, 
            BABYLON.Animation.ANIMATIONTYPE_FLOAT, 
            BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
        )
        const durationSeconds = 0.4;
        const totalFrames = this.FPS * durationSeconds;
        animationFrames.push({frame: 0, value: 0})
        animationFrames.push({frame: Math.round(totalFrames * (45/100)), value: 0.8 * radius})
        animationFrames.push({frame: Math.round(totalFrames * (50/100)), value: 1 * radius})
        animationFrames.push({frame: Math.round(totalFrames * (55/100)), value: 0.8 * radius})
        animationFrames.push({frame: Math.round(totalFrames), value: 0})
        animation.setKeys(animationFrames);
        hitStarMesh.animations.push(animation);
        this._scene.beginAnimation(hitStarMesh, 0, totalFrames, false, 1, ()=>{
            hitStarMesh.dispose();
        });
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

    // Returns true if the a shot ocurred, false otherwise
    private getNearestAttackTarget(characterUniqueId: number): Mesh {
        const characterMesh = this.getRootMesh(characterUniqueId);
        
        const targets = this._scene.getMeshesByTags("arcadian").filter((v)=>v.uniqueId != characterMesh.uniqueId);
        if (!targets || targets.length == 0) {
            return;
        }
        targets.sort((a, b)=>a.position.subtract(characterMesh.position).length() - b.position.subtract(characterMesh.position).length())

        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            const deltaPosition = target.position.subtract(characterMesh.position);

            const origin = characterMesh.position;
            const ray = new BABYLON.Ray(origin, deltaPosition);
            
            // let rayHelper = new BABYLON.RayHelper(ray);		
            // rayHelper.show(this._scene);
            characterMesh.isPickable = false;
            const hit = this._scene.pickWithRay(ray);
            characterMesh.isPickable = true;

            const tags = BABYLON.Tags.GetTags(hit.pickedMesh) || [];
            if (tags.includes("arcadian")) {
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
        hitMaterial.emissiveColor = new Color3(0,0,1);
        // hitMaterial.emissiveTexture = hitTexture;
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

    private getHp(characterMesh: Mesh) {
        const hpBar = characterMesh.getChildMeshes(true, (node)=>node.name == "hpBar")[0] as Mesh;
        const currentHp = Number(hpBar.metadata);
        return currentHp;
    }

    private registerHit(hitMeshUniqueId: number, damage: number, animateHit: boolean = true): number {
        const parentMesh = this.getRootMesh(hitMeshUniqueId);
        const hpBar = parentMesh.getChildMeshes(true, (node)=>node.name == "hpBar")[0] as Mesh;
        const hpBarMax = parentMesh.getChildMeshes(true, (node)=>node.name == "maxHpBar")[0] as Mesh;
        const maxHp = Number(hpBarMax.metadata);
        const currentHp = Number(hpBar.metadata);
        const updatedHp = Math.max(currentHp - damage, 0);
        if (updatedHp == 0) {
            this.stopGroupAnimations(hitMeshUniqueId);
            const animation = this.getGroupAnimation(hitMeshUniqueId, ANIMATION_LIST.death);
            animation.start(false);
            parentMesh.physicsImpostor.dispose();
            parentMesh.isPickable = false;
            hpBar.dispose();
            hpBarMax.dispose();
            BABYLON.Tags.AddTagsTo(parentMesh, "dead");
            BABYLON.Tags.RemoveTagsFrom(parentMesh, "arcadian");

            new BABYLON.Sound("hit", "sounds/die.mp3", this._scene, null, {autoplay: true, volume: this.getVolume(parentMesh.position), maxDistance: this.MAX_SOUND_DISTANCE})
        } else if (animateHit) {
            const animation = this.getGroupAnimation(hitMeshUniqueId, ANIMATION_LIST.hit);
            animation.start(false);

            const hitSounds = ["hit1.mp3", "hit4.mp3", "hit5.mp3"];
            const randomHitSound = hitSounds[Math.floor(Math.random()*(hitSounds.length-1))]
            new BABYLON.Sound("die", "sounds/"+randomHitSound, this._scene, null, {autoplay: true, volume: this.getVolume(parentMesh.position), maxDistance: this.MAX_SOUND_DISTANCE})
        }
        const maxHpBarWidth = 1;
        hpBar.position.x += (damage / maxHp * maxHpBarWidth) / 2;
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
        let body = BABYLON.MeshBuilder.CreateCylinder("body", {diameter: this.arcadiansSize.width, height: this.arcadiansSize.height});
        body.metadata = "arcadian";
        body.name = "arcadian_" + arcadianId;
        BABYLON.Tags.AddTagsTo(body, "arcadian");
        body.visibility = 0;
        body.position = position;
        body.physicsImpostor = new BABYLON.PhysicsImpostor(body, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 70, restitution: 0.3, friction: 0.3});
        body.physicsImpostor.physicsBody.angularDamping = 1;
        body.checkCollisions = true;
        const nodeUniqueId = body.uniqueId;
        const {meshes, animationGroups} = await SceneLoader.ImportMeshAsync(null, "ArcadianAvatar", ".gltf", this._scene);
        const arcadianMesh = meshes[0];
        animationGroups[0].stop();
        arcadianMesh.setParent(body);
        arcadianMesh.position = new Vector3(0, -this.arcadiansSize.height/2, 0);
        arcadianMesh.isPickable = false;

        const childMeshes = arcadianMesh.getChildMeshes();
        for (const childMesh of childMeshes) {
            childMesh.isPickable = false;
        }
        for (const group of animationGroups) {
            group.name = body.uniqueId + this.SEPARATOR + group.name
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
        this.createHpBar(body, maxHp);

        body.actionManager = new BABYLON.ActionManager(this._scene);
        body.actionManager.registerAction(
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

    private moveCharacter(nodeUniqueId: number, destination: Vector3) {
        const characterMesh = this.getRootMesh(nodeUniqueId);
        
        const tags = BABYLON.Tags.GetTags(characterMesh) || [];
        if (tags.includes("frost")) {
            return;
        }
        destination.y = characterMesh.position.y;
        const speed = 4;
        let distance = destination.subtract(characterMesh.position);

        characterMesh.scaling = new Vector3(-Math.sign(distance.x)*1, 1, 1);

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