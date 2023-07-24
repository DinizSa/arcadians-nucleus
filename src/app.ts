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

interface ItemRarity {
    name: string;
    rarity: 'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Epic';
}
interface Weapon {
    id: number;
    image: string;
    name: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'epic';
    physicalDamage: number;
    magicDamage: number;
    range: number;
    weight: number,
    reloadTime: number;
    type: 'spell' | 'melee' | 'gun';
    hasProjectile: boolean;
    projectileSpeed: number;
    projectileWeight: number;
    radiusArea: number;
    maxTargetsOffense: number;
    maxTargetsDefense: number;
    frostDuration: number;
    burnDuration: number;
    burnTotalDamage: number;
    shockDamage: number;
    lifesteal: number;
    healAmount: number;
    conversionSeconds: number;
    deltaArmor: number;
    deltaMagicResist: number;
    shieldSeconds: number;
    projectileColor: string;
    slotName?: string;
};

interface HandEquippment {
    weapon: Weapon;
    availableAt: number; // Epoch seconds at which the weapon can shoot again
    slotName: string;
}

interface CharacterData {
    faction: 'Sun' | 'Moon';
    subFaction: 'arcadian' | 'orcBerserc' | 'orcShaman' | 'orcWarrior' | "vikingAxe" | "vikingSword" | "vikingSpear";
    uniqueId: number;
    armor: number; // percentage or physical damage ignored
    magicResist: number; // percentage of magic damage ignored
    movementSpeed: number;
    maxHp: number;
    isAlive: boolean;
    frozenCounter: number;
    shieldCounter: number;
    currentHp: number;
    rightHand?: HandEquippment; 
    leftHand?: HandEquippment;
    sprite?: BABYLON.Sprite;
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
    hurt: "m.hit",
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

interface AnimationMap {
    start: number;
    end: number;
}
interface AnimationStartStop {[key: string]: AnimationMap};

interface SpriteCharacterSetup {
    category: CharacterData["subFaction"];
    leftHandEquippment: string;
    rightHandEquippment: string;
    animations: AnimationStartStop;
    size: number;
}
const orcBerserkData: SpriteCharacterSetup = {
    category: 'orcBerserc',
    leftHandEquippment: "Reaperblade",
    rightHandEquippment: "Valorous Blade",
    size: 4,
    animations: {
        idle: {start: 0, end: 4},
        walk: {start: 9, end: 15},
        run: {start: 18, end: 23},
        attackLeftHand: {start: 36, end: 39},
        attackRightHand: {start: 45, end: 49},
        jump: {start: 63, end: 67},
        hurt: {start: 72, end: 73},
        death: {start: 81, end: 84}
    }
}

const orcShamanData: SpriteCharacterSetup = {
    category: 'orcShaman',
    leftHandEquippment: "Constellation Scribe",
    rightHandEquippment: "Royal Wand of Power",
    size: 4,
    animations: {
        idle: {start: 0, end: 4},
        walk: {start: 9, end: 15},
        run: {start: 18, end: 23},
        attackRightHand: {start: 45, end: 52},
        attackLeftHand: {start: 54, end: 59},
        jump: {start: 63, end: 68},
        hurt: {start: 72, end: 73},
        death: {start: 81, end: 85},
    }
}
const orcWarriorData: SpriteCharacterSetup = {
    category: 'orcWarrior',
    leftHandEquippment: "Axe of Strings",
    rightHandEquippment: "Common Axe",
    size: 4,
    animations: {
        idle: {start: 0, end: 4},
        walk: {start: 9, end: 15},
        run: {start: 18, end: 23},
        attackRightHand: {start: 36, end: 39},
        attackLeftHand: {start: 45, end: 48},
        jump: {start: 63, end: 70},
        hurt: {start: 72, end: 73},
        death: {start: 81, end: 84},
    }
}
const vikingAxeData: SpriteCharacterSetup = {
    category: 'vikingAxe',
    leftHandEquippment: "Ichika's Doomblade",
    rightHandEquippment: "Iron Fist",
    size: 4,
    animations: {
        idle: {start: 0, end: 5},
        walk: {start: 9, end: 16},
        run: {start: 18, end: 23},
        attackRightHand: {start: 27, end: 30},
        // attackRightHand: {start: 36, end: 39},
        attackLeftHand: {start: 45, end: 48},
        jump: {start: 63, end: 70},
        hurt: {start: 72, end: 73},
        death: {start: 81, end: 84},
    }
}

const vikingSwordData: SpriteCharacterSetup = {
    category: 'vikingSword',
    leftHandEquippment: "Neuromantic Saber",
    rightHandEquippment: "Kite Shield",
    size: 4,
    animations: {
        idle: {start: 0, end: 4},
        walk: {start: 9, end: 16},
        run: {start: 18, end: 23},
        attackRightHand: {start: 45, end: 48},
        attackLeftHand: {start: 27, end: 30},
        jump: {start: 63, end: 69},
        hurt: {start: 72, end: 74},
        death: {start: 81, end: 84},
    }
}

const vikingSpearData: SpriteCharacterSetup = {
    category: 'vikingSpear',
    leftHandEquippment: "Squire's Lance",
    rightHandEquippment: "Shining Barrier",
    size: 4,
    animations: {
        idle: {start: 0, end: 4},
        walk: {start: 9, end: 16},
        run: {start: 18, end: 23},
        attackLeftHand: {start: 36, end: 39},
        attackRightHand: {start: 54, end: 56},
        jump: {start: 63, end: 70},
        hurt: {start: 72, end: 73},
        death: {start: 81, end: 84},
    }
}

const charactersSetup: {[key: string]: SpriteCharacterSetup} = {
    orcBerserc: orcBerserkData,
    orcShaman: orcShamanData,
    orcWarrior: orcWarriorData,
    vikingAxe: vikingAxeData,
    vikingSword: vikingSwordData,
    vikingSpear: vikingSpearData,
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
    private itemsRarity: ItemRarity[];

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
    private defaultProjectileColor = new BABYLON.Color4(1, 0.2, 0, 0.8);
    private charactersTracker: {[key: number]: CharacterData} = {};

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
        this.setupSpriteManagers();

        const rowsArcadians = 1;
        const colsArcadians = 6;
        const distanceArcadians = 4;
        const startX = this.fieldFimensions.x/2 - (rowsArcadians/2) * distanceArcadians + 10;
        const startZ = this.fieldFimensions.z/2 - (colsArcadians/2) * distanceArcadians;

        this.createSpriteCharacter('orcBerserc', this.fieldFimensions.x/2 - 4, this.fieldFimensions.z/2 - 10)
        this.createSpriteCharacter('orcShaman', this.fieldFimensions.x/2 - 5, this.fieldFimensions.z/2 - 6)
        this.createSpriteCharacter('orcWarrior', this.fieldFimensions.x/2 - 6, this.fieldFimensions.z/2 - 2)
        this.createSpriteCharacter('vikingAxe', this.fieldFimensions.x/2 - 7, this.fieldFimensions.z/2 + 2)
        this.createSpriteCharacter('vikingSword', this.fieldFimensions.x/2 - 8, this.fieldFimensions.z/2 + 6)
        this.createSpriteCharacter('vikingSpear', this.fieldFimensions.x/2 - 9, this.fieldFimensions.z/2 + 10)
        for (let i = 0; i < rowsArcadians; i++) {
            for (let j = 0; j < colsArcadians; j++) {
                const counter = 1 + i * rowsArcadians + j;
                this.loadArcadian(counter, new Vector3(startX + i * distanceArcadians + counter, this.arcadiansSize.height/2+0.1, startZ + j * distanceArcadians));
            }
        }

        // run the main render loop
        this._engine.runRenderLoop(() => {
            this._scene.render();
        });

        // Handle pointer clicks
        this._scene.onPointerDown = (event: BABYLON.IPointerEvent, pickInfo: BABYLON.PickingInfo) => {
            if (event.button ===0 && pickInfo.hit) {
                if (this.selectedCharacterId && pickInfo.hit && pickInfo.pickedMesh.metadata === "ground") {
                    this.moveCharacter(this.selectedCharacterId, pickInfo.pickedPoint);
                } else if (!this.selectedCharacterId && pickInfo.hit && pickInfo.pickedMesh.metadata === "ground") {
                    this.selectedCharacterId = 0;
                    this._selectedMark.setEnabled(false);
                } else {
                    if (this.charactersTracker[pickInfo.pickedMesh.uniqueId]) {
                        this.selectedCharacterId = pickInfo.pickedMesh.uniqueId;
                        this.startSelectedMarkAnim(this.selectedCharacterId);
                    }
                }
            }
        }

        window.addEventListener("keydown", (ev) => {
            if (ev.keyCode === 32) {
                if (this.selectedCharacterId) {
                    this.attackBothHands(this.selectedCharacterId);
                }
            } else if (ev.keyCode === 88) {
                if (this.selectedCharacterId) {
                    this.moveAndAttack(
                        this.selectedCharacterId, 
                        this.charactersTracker[this.selectedCharacterId].leftHand
                    );
                }
            } else if (ev.keyCode === 90) {
                if (this.selectedCharacterId) {
                    this.moveAndAttack(
                        this.selectedCharacterId, 
                        this.charactersTracker[this.selectedCharacterId].rightHand
                    );
                }
            } else if (ev.keyCode == 27) {
                this.selectedCharacterId = 0;
                this._selectedMark.setEnabled(false);
            }
        });

        this._scene.registerAfterRender(()=>{
            this.updateInfoBanner()
        })
    }

    private updateInfoBanner() {
        if (this.selectedCharacterId) {
            const character = this.charactersTracker[this.selectedCharacterId]
            document.getElementById("root").hidden = false;
            document.getElementById("currentHp").textContent = `${character.currentHp.toPrecision(3)}`;
            document.getElementById("maximumHp").textContent = `${character.maxHp}`;
            document.getElementById("armor").textContent = `${character.armor}`;
            document.getElementById("magicResist").textContent = `${character.magicResist}`;
            document.getElementById("faction").textContent = `${character.faction}`;
        } else {
            document.getElementById("root").hidden = true;
        }
    }

    private startSelectedMarkAnim(parentUniqueId: number) {
        const parentMesh = this.getRootMesh(parentUniqueId)
        this._selectedMark.setEnabled(true);
        this._selectedMark.parent = parentMesh;
        this._selectedMark.position.y = parentMesh.getBoundingInfo().maximum.y + 1.3;
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

    private getPojectileColor(weapon: Weapon): BABYLON.Color4 {
        if (weapon.projectileColor !== undefined) {
            let projectileColor = weapon.projectileColor.split(',').map((v)=>Number(v));
            return new BABYLON.Color4(projectileColor[0]/256, projectileColor[1]/256, projectileColor[2]/256, projectileColor[3]/256)
        }
    }

    private getGunProjectile(weapon: Weapon): Mesh {
        const projectileColor = this.getPojectileColor(weapon) || this.defaultProjectileColor;
        const projectile = this._projetile.clone("gunProjectileClone");
        const material = new BABYLON.StandardMaterial("gunProjectile", this._scene);
        material.ambientTexture = this.getTexture("combat/cloud.jpg");
        material.diffuseColor = new Color3(projectileColor.r, projectileColor.g, projectileColor.b);
        projectile.material = material;

        const particleSystems = projectile.getConnectedParticleSystems()
        if (particleSystems?.length) {
            const particleSystem = particleSystems[0];
            particleSystem.color1 = projectileColor;
            particleSystem.color2 = projectileColor;
        }
        return projectile;
    }

    private setupProjectile() {
        const material = new BABYLON.StandardMaterial("gunProjectile", this._scene);
        material.ambientTexture = this.getTexture("combat/cloud.jpg");
        material.roughness = 10;
        let projetile = BABYLON.MeshBuilder.CreateSphere("projectile", {diameter: 0.3}, this._scene);
        projetile.material = material;
        projetile.isPickable = false;
        projetile.setEnabled(false);
        projetile.checkCollisions = true;
        this._projetile = projetile;

        const particleSystem = new BABYLON.ParticleSystem('particles', 1000, this._scene);
        particleSystem.emitter = projetile;
        particleSystem.emitRate = 30;
        particleSystem.particleTexture = this.getTexture('combat/outlineCircle.png');
        particleSystem.minSize = 0.1;
        particleSystem.maxSize = 0.1;
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

    private handleHit(attacker: Mesh, weapon: Weapon, allies: Mesh[], enemies: Mesh[]): boolean {
        let effectiveDamageTotal = 0;
        let actionsPerformed = 0;

        // Filter shielded enemies and trigger shields
        let enemiesCapped = enemies = enemies.slice(0, weapon.maxTargetsOffense)
        enemiesCapped = enemiesCapped.filter((enemy)=>{
            if (this.triggerShield(enemy)) {
                actionsPerformed++;
                return false;
            }
            return true;
        })
        const alliesCapped = allies.slice(0, weapon.maxTargetsDefense);

        if (weapon.deltaArmor !== 0) {
            const targets = weapon.deltaArmor > 0 ? alliesCapped : enemiesCapped;
            actionsPerformed += this.updateArmor(targets, weapon.deltaArmor, weapon.reloadTime, attacker.position)
        }

        if (weapon.deltaMagicResist > 0) {
            const targets = weapon.deltaMagicResist > 0 ? alliesCapped : enemiesCapped;
            actionsPerformed += this.updateMagicResist(targets, weapon.deltaMagicResist, weapon.reloadTime, attacker.position)
        }

        // Trigger direct damage and filter dead enemies
        if (weapon.magicDamage > 0 || weapon.physicalDamage > 0) {
            enemiesCapped = enemiesCapped.filter((enemy)=>{
                const effectiveDamage = this.getEffectiveDamage(weapon.magicDamage, weapon.physicalDamage, enemy.uniqueId);
                effectiveDamageTotal += effectiveDamage;
                const updatedHp = this.updateHp(enemy, -effectiveDamage);
                actionsPerformed++;
                return updatedHp > 0;
            })
        }

        if (weapon.frostDuration > 0) {
            actionsPerformed += this.applyFrost(enemiesCapped, weapon.frostDuration, attacker.position);
        }

        if (weapon.shockDamage > 0) {
            let color: BABYLON.Color4 = this.getPojectileColor(weapon);
            actionsPerformed += this.applyShock(enemiesCapped, weapon.shockDamage, attacker.position, color, !weapon.hasProjectile);
        }

        // Apply weapon effects
        if (weapon.healAmount > 0) {
            if (this.applyHeal(allies, weapon.healAmount, attacker.position, weapon.maxTargetsDefense)) {
                actionsPerformed++;
            }
        }

        if (weapon.burnTotalDamage > 0) {
            effectiveDamageTotal += this.applyBurn(enemiesCapped, weapon.burnDuration, weapon.burnTotalDamage, attacker.position)
            actionsPerformed += enemiesCapped.length;
        }

        if (weapon.shieldSeconds > 0) {
            actionsPerformed += this.createShield(alliesCapped, weapon.shieldSeconds, attacker.position)
        }

        if (weapon.conversionSeconds > 0) {
            actionsPerformed += this.convertTarget(enemiesCapped, weapon.conversionSeconds, attacker.position);
        }

        if (weapon.lifesteal > 0) {
            const lifestealAmount = effectiveDamageTotal*(weapon.lifesteal/100);
            this.applyHeal([attacker], lifestealAmount);
        }
        return actionsPerformed !== 0;
    }

    private projectileAttack(attacker: Mesh, weapon: Weapon, allies: Mesh[], enemies: Mesh[]): boolean {
        const target = this.getNearestVisibleTarget(attacker, enemies);
        if (!target) {
            return false;
        }
        const horizontalDirection = Math.sign(target.position.x - attacker.position.x) || 1
        const projectileStartPosition = attacker.position.add(
            new Vector3(horizontalDirection * this.arcadiansSize.width* (3/4), 0, 0)
        );
        const attackDirection = target.position.subtract(projectileStartPosition).scale(1.15); // TODO: factor to compensate unkown bias
        const distance = target.position.subtract(projectileStartPosition).length();
        if (weapon.range <= distance) {
            return false;
        }
        this.faceDirection(attacker, target.position);

        // Create projectile
        let projectile: Mesh;
        let delayProjectile: number;
        if (weapon.type ==='gun') {
            projectile = this.getGunProjectile(weapon);
            projectile.position = projectileStartPosition.add(new Vector3(0, 1, 0));
            delayProjectile = 300;
        } else if (weapon.type ==="melee") {
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
            
            if (weapon.radiusArea > 0) {
                enemies = enemies.filter((enemy)=>projectile.position.subtract(enemy.position).length() <= weapon.radiusArea)
                allies = allies.filter((ally)=>ally.position.subtract(attacker.position).length() <= weapon.radiusArea)
            } else {
                enemies = [collidedMesh]
                allies = [attacker]
            }
            
            if (weapon.type ==="gun" && weapon.radiusArea > 0 && (weapon.physicalDamage > 0 || weapon.magicDamage > 0)) {
                const projectileColor = this.getPojectileColor(weapon);
                this.animateExplosion(projectile.position, weapon.radiusArea, projectileColor);
            }

            this.handleHit(attacker, weapon, allies, enemies);

            this.stopParticlesSystem(projectile);
            projectile.dispose();
        };

        const physicsImpostors = enemies.map((v: Mesh)=>v.physicsImpostor);
        projectile.physicsImpostor.registerOnPhysicsCollide(physicsImpostors, onHit);

        setTimeout(() => {
            projectile.setEnabled(true);

            if (weapon.type ==='gun') {
                let time = distance / weapon.projectileSpeed;
                const forceX = attackDirection.x / time;
                const forceY = target.position.y + attackDirection.y / time - this.GRAVITY * time * (1/2);
                const forceZ = attackDirection.z / time;
                const impulse = new Vector3(forceX, forceY, forceZ).scale(weapon.projectileWeight);

                projectile.physicsImpostor?.applyImpulse(impulse, projectile.getAbsolutePosition());
                projectile.physicsImpostor?.setAngularVelocity(Vector3.One().scale(2))

                
                new BABYLON.Sound("fireGrenade", "sounds/Fire Grenade.wav", this._scene, null, {autoplay: true, volume: this.getVolume(projectile.position), maxDistance: this.MAX_SOUND_DISTANCE})

            } else if (weapon.type ==="melee") {
                const direction = BABYLON.Vector3.Normalize(attackDirection);
                const impulse = direction.scale(weapon.projectileWeight).scale(weapon.projectileSpeed);
                projectile.physicsImpostor.applyImpulse(impulse, projectile.getAbsolutePosition());

                const lifeTime = weapon.range / weapon.projectileSpeed;
                setTimeout(() => {
                    projectile.dispose();
                }, 1000 * lifeTime);

                this.animateMeleeSlash(attacker, projectile.position, this.getPojectileColor(weapon));

                new BABYLON.Sound("sword", "sounds/Sword.wav", this._scene, null, {autoplay: true, volume: this.getVolume(projectile.position), maxDistance: this.MAX_SOUND_DISTANCE})
            }
        }, delayProjectile);
        
        return true;
    }

    private attackBothHands(attackerUniqueId: number) {
        let attacked = this.attackSingleHand(attackerUniqueId, this.charactersTracker[attackerUniqueId].rightHand);

        setTimeout(() => {
            attacked = this.attackSingleHand(attackerUniqueId, this.charactersTracker[attackerUniqueId].leftHand);
        }, attacked ? 700 : 0); // wait second projectile To avoid 2 projectiles collision
    }

    private attackSingleHand(attackerUniqueId: number, handEquippment: HandEquippment): boolean {
        const attacker = this.getRootMesh(attackerUniqueId);
        if (
            !this.charactersTracker[attackerUniqueId].isAlive || 
            this.charactersTracker[attackerUniqueId].frozenCounter > 0
        ) {
            return false;
        }

        let allies = this.getAllies(attacker);
        let enemies = this.getEnemies(attacker);
        if (allies.length === 0 || enemies.length === 0) {
            return false;
        }

        if (!handEquippment?.weapon) {
            return false;
        }
        if (handEquippment.availableAt > Date.now()) {
            return false;
        }

        let attacked = false;
        if (handEquippment.weapon.hasProjectile || handEquippment.weapon.type == "melee") {
            attacked = this.projectileAttack(attacker, handEquippment.weapon, allies, enemies);
        } else {
            if (handEquippment.weapon.range > 0) {
                enemies = enemies.filter((enemy)=> attacker.position.subtract(enemy.position).length() <= handEquippment.weapon.range)
                allies = allies.filter((ally)=>ally.position.subtract(attacker.position).length() <= handEquippment.weapon.range)
            }
            attacked = this.handleHit(attacker, handEquippment.weapon, allies, enemies);
        }

        // attack animation
        if (attacked) {
            const animation = handEquippment.slotName == slotsNames.leftHand ? "attackLeftHand" : "attackRightHand"

            this.animateCharacter(attacker.uniqueId, animation, false);

            const availableAt = Date.now() + handEquippment.weapon.reloadTime * 1000;
            if (handEquippment.slotName === slotsNames.rightHand) {
                this.charactersTracker[attacker.uniqueId].rightHand.availableAt = availableAt;
            } else if (handEquippment.slotName === slotsNames.leftHand) {
                this.charactersTracker[attacker.uniqueId].leftHand.availableAt = availableAt;
            }
        }
        
        return attacked;
    }

    private convertTarget(targets: Mesh[], durationSeconds: number, soundOrigin: Vector3): number {
        new BABYLON.Sound("convert", "sounds/curse.ogg", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})

        const particleSystem = new BABYLON.ParticleSystem('convertEffect', 300, this._scene);
        particleSystem.particleTexture = this.getTexture('combat/mindControl.png', true);
        particleSystem.emitRate = 5;
        particleSystem.minSize = 0.5;
        particleSystem.maxSize = 0.8;
        particleSystem.minLifeTime = 1;
        particleSystem.maxLifeTime = 2;
        particleSystem.disposeOnStop = true;

        let conversionCounter = 0;
        for (const target of targets) {
            const particleSystemClone = particleSystem.clone("convertEffectClone", target)
            particleSystemClone.start();
            
            const faction = this.getFaction(target);
            const enemyFaction = this.getEnemyFaction(faction);
            this.charactersTracker[target.uniqueId].faction = enemyFaction;
    
            setTimeout(() => {
                this.charactersTracker[target.uniqueId].faction = faction;

                particleSystemClone.stop();
            }, durationSeconds*1000);

            conversionCounter++;
        }
        particleSystem.dispose(false);
        return conversionCounter;
    }

    private applyHeal(targets: Mesh[], amountToHeal: number, soundOrigin: Vector3 = null, maxTargets: number = undefined): boolean {
        let targetsHealed = 0;
        for (const target of targets) {
            if (maxTargets !== undefined && targetsHealed === maxTargets) {
                break;
            }
            if (this.getHpPercentage(target.uniqueId) === 100) {
                continue;
            }
            this.updateHp(target, amountToHeal, false);
            targetsHealed += 1;
        }
        if (targetsHealed > 0 && soundOrigin) {
            new BABYLON.Sound("heal", "sounds/heal.ogg", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})
        }
        return targetsHealed !== 0;
    }

    private applyShock(targets: Mesh[], damage: number, attackerPosition: Vector3, color: BABYLON.Color4 = undefined, showShockFromAttacker: boolean = false): number {
        new BABYLON.Sound("eletricShock", "sounds/eletricShock.mp3", this._scene, null, {autoplay: true, volume: this.getVolume(attackerPosition), maxDistance: this.MAX_SOUND_DISTANCE})
        
        let shockCounter = 0;
        let previousPosition: Vector3;
        if (showShockFromAttacker) {
            previousPosition = attackerPosition;
        }

        for (const target of targets) {
            const effectiveDamage = this.getEffectiveDamage(damage, 0, target.uniqueId);
            this.updateHp(target, -effectiveDamage, true);
            const spriteManager = this.getSpriteManager("shockBean")
            
            if (previousPosition) {
                const sprite = new BABYLON.Sprite("sprite", spriteManager);
                const distance = target.position.x - previousPosition.x;
                if (distance < 0.1) {
                    continue;
                }

                sprite.width = distance;
                sprite.position = target.position.add(previousPosition).scaleInPlace(1/2); 
                sprite.disposeWhenFinishedAnimating = true;
                // if (color) {
                    // sprite.color = color;
                // }
                sprite.playAnimation(0, 3, false, 50);
            }
            previousPosition = target.position;
            shockCounter++;
        }
        return shockCounter;
    }

    private applyBurn(targets: Mesh[], durationSeconds: number, totalDamage: number, soundOrigin: Vector3): number {
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
            const effectiveDamage = this.getEffectiveDamage(totalDamage, 0, target.uniqueId);
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

    private applyFrost(targets: Mesh[], durationSeconds: number, soundOrigin: Vector3) {
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

        let frostCounter = 0;
        for (const target of targets) {
            const particleSystemClone = particleSystem.clone("particleSystemClone", target)
            particleSystemClone.start();

            this.charactersTracker[target.uniqueId].frozenCounter++;
            if (this.charactersTracker[target.uniqueId]?.leftHand) {
                this.charactersTracker[target.uniqueId].leftHand.availableAt += durationSeconds * 1000;
            }
            if (this.charactersTracker[target.uniqueId]?.rightHand) {
                this.charactersTracker[target.uniqueId].rightHand.availableAt += durationSeconds * 1000;
            }

            this.stopAnimations(target.uniqueId);
            
            setTimeout(() => {
                this.charactersTracker[target.uniqueId].frozenCounter--;
                particleSystemClone.stop();

                if (this.charactersTracker[target.uniqueId].isAlive && this.charactersTracker[target.uniqueId].frozenCounter === 0) {
                    this.animateCharacter(target.uniqueId, "idle", true)
                }
            }, durationSeconds * 1000);

            frostCounter++;
        }
        particleSystem.dispose(false);
        return frostCounter;
    }

    private getEffectiveDamage(magicDamage: number, physicalDamage: number, uniqueId: number) {
        const characterData: CharacterData = this.charactersTracker[uniqueId];
        const magicResist = characterData.magicResist; 
        const armor = characterData.armor;
        const damage = (magicDamage * (1 - magicResist/100)) + (physicalDamage * (1 - armor/100));
        return damage;
    }

    private setupSpriteManagers() {
        const capacity = 100;
        new BABYLON.SpriteManager("explosion", "spritesheets/explosion.png", capacity, 192, this._scene);
        new BABYLON.SpriteManager("swordSlash", "spritesheets/swordSlash.png", capacity, 400, this._scene);
        new BABYLON.SpriteManager("shockBean", "spritesheets/shockBean.png", capacity, 64, this._scene);
        
        new BABYLON.SpriteManager("orcBerserc", "spritesheets/orcBerserc.png", capacity, 96, this._scene);
        new BABYLON.SpriteManager("orcShaman", "spritesheets/orcShaman.png", capacity, 96, this._scene);
        new BABYLON.SpriteManager("orcWarrior", "spritesheets/orcWarrior.png", capacity, 96, this._scene);
        
        new BABYLON.SpriteManager("vikingAxe", "spritesheets/vikingAxe.png", capacity, 96, this._scene);
        new BABYLON.SpriteManager("vikingSword", "spritesheets/vikingSword.png", capacity, 96, this._scene);
        new BABYLON.SpriteManager("vikingSpear", "spritesheets/vikingSpear.png", capacity, 96, this._scene);
    }

    private getSpriteManager(name: string): BABYLON.ISpriteManager {
        return this._scene.spriteManagers.find((sp)=>sp.name ===name)
    }

    private animateMeleeSlash(attacker: Mesh, attackStartPosition: Vector3, color: BABYLON.Color4 = undefined) {
        const horizontalDirection = Math.sign(attacker.position.x - attackStartPosition.x) || 1
        const boundingInfo = attacker.getBoundingInfo();

        const spriteManager = this.getSpriteManager("swordSlash")
        const sprite = new BABYLON.Sprite("sprite", spriteManager);
        sprite.invertU = horizontalDirection === 1 ? false : true;
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

    private stopParticlesSystem(mesh: Mesh) {
        const particleSystems = mesh.getConnectedParticleSystems()
        for (let i = 0; i < particleSystems.length; i++) {
            particleSystems[i].disposeOnStop = true;
            particleSystems[i].stop();
        }
    }

    private getWeapon(weaponName: string): Weapon {
        if (!weaponName) {
            return undefined;
        }
        return this.weaponsList.find((weapon) => weapon.name === weaponName);
    }

    private getTags(mesh: Mesh) : string[] {
        return BABYLON.Tags.GetTags(mesh) || [];
    }

    private getFaction(character: Mesh): "Moon" | "Sun" {
        return this.charactersTracker[character.uniqueId]?.faction;
    }

    private getEnemyFaction(faction: string): "Moon" | "Sun" {
        return ["Moon", "Sun"].find((v)=>v!=faction) as "Moon" | "Sun"
    }
    
    private getAllies(character: Mesh): Mesh[] {
        const allyFaction = this.getFaction(character);
        const allies = this._scene.getMeshesByTags(`${allyFaction} && !dead`);
        allies.sort((a, b)=>a.position.subtract(character.position).length() - b.position.subtract(character.position).length())
        return allies || [];
    }

    private getEnemies(attacker: Mesh): Mesh[] {
        const enemyFaction = this.getEnemyFaction(this.getFaction(attacker));
        const enemies = this._scene.getMeshesByTags(`${enemyFaction} && !dead`);
        enemies.sort((a, b)=>a.position.subtract(attacker.position).length() - b.position.subtract(attacker.position).length())
        return enemies || [];
    }

    private getNearestVisibleTarget(attacker: Mesh, targets: Mesh[]): Mesh {
        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            const horizontalDirection = Math.sign(target.position.x - attacker.position.x) || 1
            const projectileStartPosition = attacker.position.add(
                new Vector3(horizontalDirection * this.arcadiansSize.width* (3/4), 0, 0)
            );
            
            const deltaPosition = target.position.subtract(projectileStartPosition);
            const ray = new BABYLON.Ray(projectileStartPosition, deltaPosition);
            
            // new BABYLON.RayHelper(ray).show(this._scene);
            attacker.isPickable = false;
            const hit = this._scene.pickWithRay(ray, undefined, false);
            attacker.isPickable = true;

            if (targets.some((t)=>t.uniqueId === hit.pickedMesh?.uniqueId)) {
                return hit.pickedMesh as Mesh;
            }
        }
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

    private createHpBar(parent: Mesh) {
        const boundingInfo = parent.getBoundingInfo();
        const hpBarMax = this._scene.getMeshByName("maxHpBar_original").clone("maxHpBar", parent);
        hpBarMax.position.y += boundingInfo.maximum.y + 0.8;
        hpBarMax.setEnabled(true);
        const hpBar = this._scene.getMeshByName("hpBar_original").clone("hpBar", parent);
        hpBar.position.y += boundingInfo.maximum.y + 0.8;
        hpBar.position.z += 0.001;
        hpBar.setEnabled(true);
    }

    private getHpPercentage(uniqueId: number) {
        return this.charactersTracker[uniqueId].currentHp / this.charactersTracker[uniqueId].maxHp;
    }

    private createShield(targets: Mesh[], duration: number, soundOrigin: Vector3): number {
        new BABYLON.Sound("increaseArmor", "sounds/magicShield.wav", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})
        const multiplierU = 1.4;
        const multiplierV = 1.2;
        const shield = BABYLON.MeshBuilder.CreateDisc("shield", {radius: (this.arcadiansSize.height/2)*multiplierV})
        const material = new BABYLON.StandardMaterial("shieldOriginal", this._scene);
        let text = this.getTexture("combat/shieldSphere.png", true);
        text.hasAlpha = true;
        material.diffuseTexture = text;

        shield.material = material;
        shield.isPickable = false;
        shield.rotate(new Vector3(0,1,0), Math.PI);
        shield.setEnabled(false);

        var animation = new BABYLON.Animation(
            "visibilityWave",
            "visibility",
            this.FPS,
            BABYLON.Animation.ANIMATIONTYPE_FLOAT,
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
        );

        const totalFrames = this.FPS*duration;
        const minValue = 0
        const maxValue = 0.4
        var keys = [
            { frame: 0, value: minValue },
            { frame: Math.floor(totalFrames*(1/10)), value: maxValue },
            { frame: Math.floor(totalFrames/2), value: maxValue },
            { frame: Math.floor(totalFrames*(9/10)), value: maxValue },
            { frame: totalFrames-1, value: minValue }
        ];
        animation.setKeys(keys);
        
        // const easingFunc = new BABYLON.CircleEase();
        // easingFunc.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT)
        // animation.setEasingFunction(easingFunc);

        let shieldCounter = 0;
        for (const target of targets) {
            const shieldClone = shield.clone("shield", target, false, true);
            shieldClone.position.y += (this.arcadiansSize.height * multiplierV - this.arcadiansSize.height) / 2;
            shieldClone.position.z += (this.arcadiansSize.width * multiplierU - this.arcadiansSize.width) / 2 + 0.1;
            shieldClone.setEnabled(true);
            this.charactersTracker[target.uniqueId].shieldCounter++;

            this._scene.beginDirectAnimation(shieldClone, [animation], 0, totalFrames, true)

            setTimeout(()=>{
                this.triggerShield(target);
            }, duration * 1000)
            shieldCounter++;
        }
        return shieldCounter;
    }

    private triggerShield(target: Mesh): boolean {
        if (this.charactersTracker[target.uniqueId].shieldCounter === 0) {
            return false;
        }
        this.charactersTracker[target.uniqueId].shieldCounter--;
        const shieldArray = target.getChildMeshes(true, (node)=>node.name === "shield");
        shieldArray[0].dispose();
        return true;
    }

    private updateMagicResist(targets: Mesh[], deltaMR: number, duration: number, soundOrigin: Vector3): number {
        if (deltaMR > 0) {
            new BABYLON.Sound("increaseMagicResist", "sounds/spellGeneric.wav", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})
        } else {
            new BABYLON.Sound("decreaseMagicResist", "sounds/debuff.wav", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})
        }
        let armorUpdateCounter = 0;
        for (const target of targets) {
            this.charactersTracker[target.uniqueId].magicResist = Math.max(this.charactersTracker[target.uniqueId].magicResist + deltaMR, 0);
    
            const particleSystem = new BABYLON.ParticleSystem('increaseMagicResist', 300, this._scene);
            particleSystem.particleTexture = this.getTexture('combat/shield.png', true);
            particleSystem.emitter = target;
            particleSystem.emitRate = 12;
            particleSystem.minSize = 0.5;
            particleSystem.maxSize = 0.5;
            particleSystem.minLifeTime = 1;
            particleSystem.maxLifeTime = 2;
            let color: BABYLON.Color4;
            if (deltaMR > 0) {
                color = new BABYLON.Color4(62/255, 175/255, 118/255, 1);
            } else {
                particleSystem.direction1 = new Vector3(0,-1,0)
                particleSystem.direction2 = new Vector3(0,-1,0)
                color = new BABYLON.Color4(1, 0, 0, 1);
            }
            particleSystem.color1 = color;
            particleSystem.color2 = color;
            particleSystem.start();
    
            setTimeout(() => {
                this.charactersTracker[target.uniqueId].magicResist = Math.max(this.charactersTracker[target.uniqueId].magicResist - deltaMR, 0);
                particleSystem.stop();
            }, duration * 1000);

            armorUpdateCounter++;
        }
        return armorUpdateCounter;
    }

    private updateArmor(targets: Mesh[], deltaArmor: number, duration: number, soundOrigin: Vector3): number {
        if (deltaArmor > 0) {
            new BABYLON.Sound("increaseArmor", "sounds/enchant2.ogg", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})
        } else {
            new BABYLON.Sound("decreaseArmor", "sounds/debuff.wav", this._scene, null, {autoplay: true, volume: this.getVolume(soundOrigin), maxDistance: this.MAX_SOUND_DISTANCE})
        }

        let armorUpdateCounter = 0;
        for (const target of targets) {
            this.charactersTracker[target.uniqueId].armor = Math.max(this.charactersTracker[target.uniqueId].armor+deltaArmor, 0);
    
            const particleSystem = new BABYLON.ParticleSystem('increaseArmor', 300, this._scene);
            particleSystem.particleTexture = this.getTexture('combat/shield.png', true);
            particleSystem.emitter = target;
            particleSystem.emitRate = 12;
            particleSystem.minSize = 0.5;
            particleSystem.maxSize = 0.5;
            particleSystem.minLifeTime = 1;
            particleSystem.maxLifeTime = 2;

            let color: BABYLON.Color4;
            if (deltaArmor > 0) {
                color = new BABYLON.Color4(0,0.5,1, 1);
            } else {
                color = new BABYLON.Color4(1, 0, 0, 1);
                particleSystem.direction1 = new Vector3(0,-1,0)
                particleSystem.direction2 = new Vector3(0,-1,0)
            }
            particleSystem.color1 = color;
            particleSystem.color2 = color;
            particleSystem.start();
    
            setTimeout(() => {
                this.charactersTracker[target.uniqueId].armor = Math.max(this.charactersTracker[target.uniqueId].armor-deltaArmor, 0);
                particleSystem.stop();
            }, duration * 1000);

            armorUpdateCounter++;
        }
        return armorUpdateCounter;
    }

    private updateHp(target: Mesh, deltaHp: number, animateHit: boolean = true): number {
        const character = this.charactersTracker[target.uniqueId];
        if (!character.isAlive) {
            return 0;
        }
        const hpBar = target.getChildMeshes(true, (node)=>node.name ==="hpBar")[0] as Mesh;
        const hpBarMax = target.getChildMeshes(true, (node)=>node.name ==="maxHpBar")[0] as Mesh;
        const maxHp = character.maxHp
        const currentHp = character.currentHp;
        const updatedHp = Math.max(Math.min(currentHp + deltaHp, maxHp), 0);
        deltaHp = updatedHp - currentHp;
        this.charactersTracker[target.uniqueId].currentHp = updatedHp;
        if (updatedHp === 0) {
            this.animateCharacter(target.uniqueId, "death", false, true)

            target.physicsImpostor.dispose();
            target.isPickable = false;
            hpBar?.dispose();
            hpBarMax?.dispose();
            this.charactersTracker[target.uniqueId].isAlive = false;
            
            BABYLON.Tags.AddTagsTo(target, "dead");

            new BABYLON.Sound("hit", "sounds/die.mp3", this._scene, null, {autoplay: true, volume: this.getVolume(target.position), maxDistance: this.MAX_SOUND_DISTANCE})
        } else if (deltaHp < 0 && animateHit) {

            this.animateCharacter(target.uniqueId, "hurt", false)

            const hitSounds = ["hit1.mp3", "hit5.mp3"];
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
        return updatedHp;
    }

    private getVolume(sourcePosition: Vector3) {
        return 1 - this._scene.cameras[0].position.subtract(sourcePosition).length()/this.MAX_SOUND_DISTANCE
    }

    private createSpriteCharacter(orcName: CharacterData["subFaction"], positionX: number, positionZ: number) {
        const orcData = charactersSetup[orcName];
        const spriteManager = this.getSpriteManager(orcName)
            
        const sprite = new BABYLON.Sprite(orcName, spriteManager);

        const size = 4;
        const position = new Vector3(positionX, size*(1/2) + 0.1, positionZ);
        sprite.size = size;
        sprite.position = position.clone()
        sprite.invertU = true;

        const diameter = size/5
        const height = size*(3/5);
        let body = BABYLON.MeshBuilder.CreateCylinder("orcBody", {diameter: diameter, height: height}, this._scene);
        body.position = position.clone();
        body.position.y = 1.30;
        body.visibility = 0;
        body.physicsImpostor = new BABYLON.PhysicsImpostor(body, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 50, restitution: 0.3, friction: 0.3}, this._scene);
        body.physicsImpostor.physicsBody.angularDamping = 1;
        body.checkCollisions = true;
        body.isPickable = true;
        const deltaPosition = body.position.subtract(sprite.position);
        this._scene.registerBeforeRender(()=>{
            sprite.position = body.position.subtract(deltaPosition)
        })

        this.createHpBar(body);

        const characterData: CharacterData = {
            uniqueId: body.uniqueId,
            faction: "Moon",
            subFaction: orcName,
            magicResist: 5,
            armor: 5,
            movementSpeed: 4,
            maxHp: 100,
            currentHp: 100,
            isAlive: true,
            frozenCounter: 0,
            shieldCounter: 0,
            sprite: sprite,
            rightHand: {
                weapon: this.getWeapon(orcData.rightHandEquippment),
                availableAt: 0, 
                slotName: slotsNames.rightHand,
            },
            leftHand: {
                weapon: this.getWeapon(orcData.leftHandEquippment),
                availableAt: 0, 
                slotName: slotsNames.leftHand,
            }
        }
        this.charactersTracker[body.uniqueId] = characterData;
        this.animateSpriteCharacter(body.uniqueId, 'idle', true);
        BABYLON.Tags.AddTagsTo(body, characterData.faction);
    }

    private animateCharacter(
        characterId: number,
        animation: 'idle' | 'walk' | 'attackLeftHand' | 'attackRightHand' | 'hurt' | 'death', 
        loop: boolean,
        stopGroupAnimations: boolean = false
    ) {
        if (this.charactersTracker[characterId].subFaction === "arcadian") {
            if (stopGroupAnimations) {
                this.stopGroupAnimations(characterId);
            }
            this.animateArcadian(characterId, animation, loop);
        } else {
            this.animateSpriteCharacter(characterId, animation, loop);
        }
    }

    private animateArcadian(
        uniqueId: number,
        animation: 'idle' | 'walk' | 'attackLeftHand' | 'attackRightHand' | 'hurt' | 'death', 
        loop: boolean
    ) {
        let animationName: string;
        const isAttackAnimation = ['attackLeftHand', 'attackRightHand'].includes(animation);
        if (isAttackAnimation) {
            const character = this.charactersTracker[uniqueId];
            const weapon = animation === 'attackRightHand' ? character.rightHand.weapon : character.leftHand.weapon;
            switch (weapon.type) {
                case "spell":
                    animationName = ANIMATION_LIST.attackWizard;
                    break;
                case "gun":
                    animationName = ANIMATION_LIST.attackGunner;
                    break;
                case "melee":
                    const isRightHandWeapon = weapon.slotName ===slotsNames.rightHand;
                    animationName = isRightHandWeapon ? ANIMATION_LIST.attackKnight : ANIMATION_LIST.attackAssassin;
                    break;
                default:
                    animationName = ANIMATION_LIST.attackTech;
                    break;
            }
            
        } else {
            animationName = ANIMATION_LIST[animation]
        }
        const groupAnimation = this.getGroupAnimation(uniqueId, animationName);
        groupAnimation.start(loop);
    }

    private animateSpriteCharacter(
        uniqueId: number,
        animation: 'idle' | 'walk' | 'run' | 'attackLeftHand' | 'attackRightHand' |'jump' | 'hurt' | 'death', 
        loop: boolean
    ) {
        const onAnimationEnd = ()=>{
            if (!loop && animation != 'death') {
                this.animateSpriteCharacter(uniqueId, 'idle', true)
            }
        }

        let animationMap = charactersSetup[this.charactersTracker[uniqueId].subFaction].animations;
        
        this.charactersTracker[uniqueId].sprite.playAnimation(
            animationMap[animation].start,
            animationMap[animation].end,
            loop,
            100,
            onAnimationEnd
        );
    }

    private async loadArcadian(arcadianId: number, position: Vector3 = Vector3.Zero()) {
        const metadataUrl = "https://arcadians.prod.outplay.games/v2/arcadians/" + arcadianId;
        const metadata = await fetch(metadataUrl).then((result)=>result.json())
        const attributes: MetadataSlot[] = metadata.attributes;

        // body to detect interactions
        let root = BABYLON.MeshBuilder.CreateCylinder(
            "arcadian_" + arcadianId, 
            {diameter: this.arcadiansSize.width, height: this.arcadiansSize.height},
            this._scene
        );
        const characterData: CharacterData = {
            uniqueId: root.uniqueId,
            faction: "Sun",
            subFaction: "arcadian",
            magicResist: 5,
            armor: 5,
            movementSpeed: 4,
            maxHp: 100,
            currentHp: 100,
            isAlive: true,
            frozenCounter: 0,
            shieldCounter: 0
        }
        this.charactersTracker[root.uniqueId] = characterData;
        BABYLON.Tags.AddTagsTo(root, characterData.faction);
        root.visibility = 0;
        root.position = position;
        root.physicsImpostor = new BABYLON.PhysicsImpostor(root, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 70, restitution: 0.3, friction: 0.3}, this._scene);
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
            
            if (slotName ===slotsNames.class || slotName ===slotsNames.gender || slotName ===slotsNames.background) 
                continue;

            const itemsSlot = this._stack.find((v)=>v.name ===slotName)
            const itemSlot = itemsSlot.layer.find((v)=>v.name ===att.value)

            const itemFilename = itemSlot.src.split("/")[1];
            const itemPath = "parts/" + itemFilename;
            const blankPath = "utils/empty399x399.png";
            const textureImage = await mergeImages([blankPath, {src: itemPath, x: itemSlot.x, y: itemSlot.y}]);
            let texture = this.getTexture(textureImage);

            texture.name = itemFilename;
            texture.hasAlpha = true;

            const material = childMeshes.find((mesh)=>mesh.material.id ===slotName).material;
            (material as any).albedoTexture = texture;
            material.name = slotName;

            if (slotName ===slotsNames.rightHand) {
                const weaponName = att.value.slice(0,-2);
                characterData.rightHand = {
                    weapon: this.getWeapon(weaponName), 
                    availableAt: 0,
                    slotName: slotName
                }
            } else if (slotName ===slotsNames.leftHand) {
                const weaponName = att.value.slice(0,-2);
                characterData.leftHand = {
                    weapon: this.getWeapon(weaponName), 
                    availableAt: 0,
                    slotName: slotName
                }
            } else if (slotName ===slotsNames.top || slotName === slotsNames.bottom || slotName === slotsNames.headgear) {
                const item = this.itemsRarity.find((v=>v.name === att.value))
                if (item) {
                    const rarityMultiplier = this.getRarityMultiplier(item.rarity)
                    const maxHp = 2 * rarityMultiplier;
                    characterData.armor += 2 * rarityMultiplier;
                    characterData.magicResist += 2 * rarityMultiplier;
                    characterData.movementSpeed += 0.2 * rarityMultiplier;
                    characterData.maxHp += maxHp;
                    characterData.currentHp += maxHp;
                }
            } else {
                // material.metadata = att.value || "";
            }
        }
        // Set hp bars
        this.createHpBar(root);

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

    private getRarityMultiplier(rarity: ItemRarity["rarity"]) {
        const allRarities = ["Common", "Uncommon", "Rare", "Legendary", "Epic"]
        const index = allRarities.findIndex((r)=> r == rarity);
        return index === -1 ? 0 : index;
    }

    private faceDirection(character: Mesh, pointToLook: Vector3) {
        const horizontalDirection = Math.sign(pointToLook.x - character.position.x) // -1 | 1
        if (horizontalDirection == 0) return;

        if (this.charactersTracker[character.uniqueId].subFaction === "arcadian") {
            const characterMesh = character.getChildMeshes(true, (node)=>node.name ==="body")[0]
            if (characterMesh.scaling.x === horizontalDirection) {
                characterMesh.scaling.x = -horizontalDirection;
            }
        } else {
            this.charactersTracker[character.uniqueId].sprite.invertU = horizontalDirection === 1 ? true : false;
        }
    }

    private moveAndAttack(characterId: number, handEquippment: HandEquippment) {
        if (!handEquippment || !handEquippment.weapon) {
            return;
        } 
        const attacker = this._scene.getMeshByUniqueId(characterId) as Mesh;
        const enemies = this.getEnemies(attacker);
        const nearestEnemy = this.getNearestVisibleTarget(
            attacker,
            enemies
        );

        if (!nearestEnemy) {
            return;
        }

        const delta = nearestEnemy.position.subtract(attacker.position);
        const distance = delta.length();
        const range = handEquippment.weapon.range;
        if (range === 0) {
            return;
        }

        let destination: Vector3;
        if (range && distance > range) {
            delta.normalize().scaleInPlace((distance+1) - range);
            destination = attacker.position.add(delta);
        } else {
            destination = attacker.position.clone();
        }

        let onArrival: ()=>void;
        onArrival = ()=>{
            this.attackSingleHand(attacker.uniqueId, handEquippment)
        }
        this.faceDirection(attacker, nearestEnemy.position);
        this.moveCharacter(attacker.uniqueId, destination, onArrival)
    }

    private moveCharacter(characterId: number, destination: Vector3, onArrival: ()=>void = ()=>{}) {
        const character = this.getRootMesh(characterId);
        
        if (this.charactersTracker[characterId].frozenCounter > 0) {
            return;
        }
        destination.y = character.position.y;
        const speed = this.charactersTracker[characterId].movementSpeed;
        let distance = destination.subtract(character.position);

        this.faceDirection(character, destination);

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
            { frame: 0, value: character.position },
            { frame: totalFrames, value: destination }
        ];
        animation.setKeys(keys);

        character.animations.push(animation);

        this._scene.stopAnimation(character, animationName);

        this.animateCharacter(characterId, 'walk', true)

        this._scene.beginDirectAnimation(character, [animation], 0, totalFrames, false, 1, () => {

            this.animateCharacter(characterId, 'idle', true, true);
            onArrival();
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
        backgroundMaterial.diffuseTexture = this.getTexture("environment/bgMountain.jpg", true);
        background.material = backgroundMaterial;
        background.rotate(new Vector3(0,1,0), Math.PI);
    }

    private getRootMesh(nodeUniqueId: number): Mesh {
        return this._scene.rootNodes.find((v)=>v.uniqueId ===nodeUniqueId) as Mesh;
    }

    private stopAnimations(characterId: number) {
        if (this.charactersTracker[characterId].subFaction === "arcadian") {
            this.stopGroupAnimations(characterId);
        } else {
            this.charactersTracker[characterId].sprite.stopAnimation()
        }
    }

    private stopGroupAnimations(uniqueId: number) {
        const activeAnimations = this._scene.animationGroups.filter((v)=>v.isPlaying && v.name.split(this.SEPARATOR)[0] ===uniqueId.toString());
        activeAnimations.forEach((v)=>v.stop())
    }
    private getGroupAnimation(uniqueId: number, animationName: string) {
        return this._scene.getAnimationGroupByName(this.getGroupAnimationName(uniqueId, animationName));
    }

    private getGroupAnimationName(animatedUniqueId: number, animationName: string): string {
        return animatedUniqueId + this.SEPARATOR + animationName
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
        this.itemsRarity = (await fetch("itemsRarity.json").then((res)=>res.json()))
    }
    private convertKeysToNumbers(obj: any) {
        const convertedObj = {};
        for (let key in obj) {
            const parsed = parseFloat(obj[key]);
            const numericKey = isNaN(parsed) ? obj[key] : parsed;
            if (["projectileColor"].includes(key)) {
                convertedObj[key] = obj[key];
            } else if (["hasProjectile"].includes(key)) {
                convertedObj[key] = obj[key] ==="TRUE" ? true : false
            } else {
                convertedObj[key] = numericKey;
            }
        }
        return convertedObj;
      }
}
new App();