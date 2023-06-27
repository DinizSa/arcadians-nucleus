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
    damage: number;
    range: number;
    weight: number,
    reloadTime: number;
    type: 'spell' | 'melee' | 'gun';
    projectileSpeed: number;
    projectileWeight: number;
    accuracyRadius: number;
    radiusArea: number;
    specialAbility: 'freeze' | 'none';
    damageType: 'magic' | 'physical';
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

    private ground: Mesh;
    private _projetile: Mesh;
    private _projetileSword: Mesh;
    private _selectedMark: Mesh;
    private _hpBarMax: BABYLON.Mesh
    private _hpBar: BABYLON.Mesh

    private fieldFimensions = new Vector3(30, 0, 15)
    private FPS = 60;
    private GRAVITY = -9.81;
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

        this.loadFilesToMemory();

        this.createScene();

        this.createTerrain();

        this.setupSelectedMark();
        this.setupHpBar()

        // run the main render loop
        this._engine.runRenderLoop(() => {
            this._scene.render();
        });

        this.setupProjectile();
    

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
        const texture = new BABYLON.Texture("environment/Gem.png", this._scene);
        texture.hasAlpha = true;
        texture.uScale = 1;
        texture.vScale = 1;
        const material = new BABYLON.StandardMaterial("mat", this._scene);
        material.diffuseTexture = texture;
        material.backFaceCulling = false;
        let mark = BABYLON.MeshBuilder.CreatePlane("plane", {width: 1, height: 1})
        mark.isPickable = false;
        mark.material = material;

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
        this._selectedMark = mark;
        mark.setEnabled(false);
    }

    private setupProjectile() {
        const material = new BABYLON.StandardMaterial("mat", this._scene);
        material.roughness = 1;
        material.emissiveColor = new Color3(1, 0.2, 0);
        let projetile = BABYLON.MeshBuilder.CreateSphere("sphere", {diameter: 0.5}, this._scene);
        projetile.material = material;
        projetile.isPickable = false;
        projetile.setEnabled(false);
        projetile.checkCollisions = true;
        this._projetile = projetile;


        const materialSword = new BABYLON.StandardMaterial("mat", this._scene);
        materialSword.roughness = 1;
        materialSword.emissiveColor = new Color3(1, 0.2, 0);
        let projetileSword = BABYLON.MeshBuilder.CreateBox(
            "box", {
                width: 0.2, 
                height: this.arcadiansSize.height, 
                depth: 0.5
            }, this._scene);
        projetileSword.material = materialSword;
        projetileSword.isPickable = false;
        projetileSword.setEnabled(false);
        projetileSword.checkCollisions = true;
        this._projetileSword = projetileSword;
    }

    private attackTarget(attackerUniqueId: number, target: Mesh) {
        const attacker = this.getRootMesh(attackerUniqueId);

        const deltaPosition = target.position.subtract(attacker.position);
        const horizontalDirection = -Math.sign(deltaPosition.x); // -1 || 1
        
        const attackPosition = attacker.position.add(
            new Vector3(-horizontalDirection * this.arcadiansSize.width* (3/4), 0, 0)
        );
        
        const attackDirection = target.position.subtract(attackPosition);
        const distance = attackDirection.length();
        const weapons: Weapon[] = this.getEquippedWeapons(attackerUniqueId);

        let weaponToUse: Weapon = weapons.find((weapon) => weapon?.range >= distance);
        if (!weaponToUse)
            return false;

        if (attacker.scaling.x != horizontalDirection) {
            attacker.scaling.x = horizontalDirection;
        }
        
        // attack animation
        let animationName: string;
        switch (weaponToUse.type) {
            case "spell":
                animationName = ANIMATION_LIST.attackWizard;
                break;
            case "gun":
                animationName = ANIMATION_LIST.attackGunner;
                break;
            case "melee":
                const isRightHandWeapon = weaponToUse.slotName == slotsNames.rightHand;
                animationName = isRightHandWeapon ? ANIMATION_LIST.attackKnight : ANIMATION_LIST.attackAssassin;
                break;
            default:
                animationName = ANIMATION_LIST.attackTech;
                break;
        }

        this.setAnimation(attacker.uniqueId, animationName, false, false);

        // Create projectile
        let projectile: Mesh;
        
        let delayProjectile: number;
        if (weaponToUse.type == 'gun' || weaponToUse.type == 'spell') {
            projectile = this._projetile.clone("projectileClone");
            projectile.position = attackPosition.add(new Vector3(0, 1, 0));
            delayProjectile = 300;
        } else if (weaponToUse.type == "melee") {
            projectile = this._projetileSword.clone("projectileSwordClone");
            projectile.position = attackPosition.clone();
            delayProjectile = 150;
        }
        
        projectile.physicsImpostor = new BABYLON.PhysicsImpostor(
            projectile, 
            BABYLON.PhysicsImpostor.BoxImpostor, {
                mass: weaponToUse.projectileWeight, 
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
            if (collidedMesh.metadata == "arcadian") {
                this.updateHpBar(collidedMesh.uniqueId, -weaponToUse.damage);
                collidedUniqueIds.push(collidedMesh.uniqueId)
            }
            setTimeout(() => {
                projectile.dispose();
            }, 500);
        };
        const physicsImpostors = this._scene.rootNodes.filter((v)=>v.metadata == "arcadian" && attacker.uniqueId != v.uniqueId).map((v: Mesh)=>v.physicsImpostor);
        projectile.physicsImpostor.registerOnPhysicsCollide(physicsImpostors, onHit);

        setTimeout(() => {
            projectile.setEnabled(true);

            if (weaponToUse.type == 'gun' || weaponToUse.type == 'spell') {
                let time = distance / weaponToUse.projectileSpeed;
                const forceX = deltaPosition.x / time;
                const forceY = target.position.y + deltaPosition.y / time - this.GRAVITY * time * (1/2);
                const forceZ = deltaPosition.z / time;
                const impulse = new Vector3(forceX, forceY, forceZ).scale(weaponToUse.projectileWeight);

                projectile.physicsImpostor.applyImpulse(impulse, projectile.getAbsolutePosition());

            } else if (weaponToUse.type == "melee") {
                const direction = BABYLON.Vector3.Normalize(attackDirection);
                const impulse = direction.scale(weaponToUse.projectileWeight).scale(weaponToUse.projectileSpeed);
                projectile.physicsImpostor.applyImpulse(impulse, projectile.getAbsolutePosition());
                
                const lifeTime = weaponToUse.range / weaponToUse.projectileSpeed;
                setTimeout(() => {
                    projectile.dispose();
                }, 1000 * lifeTime);
            }
        }, delayProjectile);
    }

    // Returns the equipped weapons sorted by damage
    private getEquippedWeapons(characterUniqueId: number): Weapon[] {
        return [slotsNames.rightHand, slotsNames.leftHand]
            .map((slotName) => ({slotName: slotName, material: this._scene.getMaterialById(this.getItemMaterialId(characterUniqueId, slotName))}))
            .filter((resp) => !!resp?.material)
            .map((resp) => {
                const weapon = this.weaponsList.find((weapon) => weapon.name == resp.material.metadata)
                weapon.slotName = resp.slotName
                return weapon;
            })
            .sort((a, b)=> b.damage - a.damage)
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

    private setupHpBar() {
        const materialMaxHp = new BABYLON.StandardMaterial("materialMaxHp", this._scene);
        materialMaxHp.diffuseColor = Color3.Red();
        materialMaxHp.backFaceCulling = false;
        this._hpBarMax = BABYLON.CreatePlane("maxHp", {width: 1, height: 0.3})
        this._hpBarMax.material = materialMaxHp;
        this._hpBarMax.setEnabled(false);

        const materialHp = new BABYLON.StandardMaterial("materialHp", this._scene);
        materialHp.diffuseColor = Color3.Blue();
        materialHp.backFaceCulling = false;
        this._hpBar = BABYLON.CreatePlane("hp", {width: 1, height: 0.3})
        this._hpBar.material = materialHp;
        this._hpBar.setEnabled(false);
    }

    private createHpBar(parent: Mesh, maxHp: number) {
        const boundingInfo = parent.getBoundingInfo();
        const hpBarMax = this._hpBarMax.clone("hpMax", parent);
        hpBarMax.position.y += boundingInfo.maximum.y + 0.5;
        hpBarMax.metadata = maxHp;
        hpBarMax.setEnabled(true);
        const hpBar = this._hpBar.clone("hp", parent);
        hpBar.position.y += boundingInfo.maximum.y + 0.5;
        hpBar.position.z += 0.01;
        hpBar.metadata = maxHp;
        hpBar.setEnabled(true);
    }

    private updateHpBar(parentUniqueId: number, deltaHp: number): number {
        const parentMesh = this.getRootMesh(parentUniqueId);
        const hpBar = parentMesh.getChildMeshes(true, (node)=>node.name == "hp")[0] as Mesh;
        const hpBarMax = parentMesh.getChildMeshes(true, (node)=>node.name == "hpMax")[0] as Mesh;
        const maxHp = Number(hpBarMax.metadata);
        const currentHp = Number(hpBar.metadata);
        const newHp = Math.max(currentHp + deltaHp, 0);
        if (newHp == 0) {
            this.setAnimation(parentUniqueId, ANIMATION_LIST.death, false, true);
            parentMesh.physicsImpostor.dispose();
            parentMesh.isPickable = false;
            hpBar.dispose();
            hpBarMax.dispose();
            BABYLON.Tags.RemoveTagsFrom(parentMesh, "arcadian");
        }
        const maxHpBarWidth = 1;
        hpBar.position.x -= (deltaHp / maxHp * maxHpBarWidth) / 2;
        hpBar.scaling.x = newHp / maxHp;
        hpBar.metadata = newHp;
        return newHp;
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
            let texture = new BABYLON.Texture(textureImage, this._scene, true, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);

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
        this.setAnimation(nodeUniqueId, ANIMATION_LIST.idle, true, false);
    }

    private moveCharacter(nodeUniqueId: number, destination: Vector3) {
        const characterMesh = this.getRootMesh(nodeUniqueId);
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
        this.setAnimation(nodeUniqueId, ANIMATION_LIST.walk);
        this._scene.beginDirectAnimation(characterMesh, [animation], 0, totalFrames, false, 1, ()=>{
            this.setAnimation(nodeUniqueId, ANIMATION_LIST.idle);
        })
    }

    private createTerrain() {
        const grassTexture = new BABYLON.Texture("environment/Grass Tile.png", this._scene);
        grassTexture.hasAlpha = true;
        grassTexture.vScale = 40;
        grassTexture.uScale = 40;
        
        const grassMaterial = new BABYLON.StandardMaterial("grassMaterial", this._scene);
        grassMaterial.ambientTexture = grassTexture;
        
        this.ground = BABYLON.MeshBuilder.CreateGround("ground", {width: this.fieldFimensions.x, height: this.fieldFimensions.z}, this._scene);
        this.ground.physicsImpostor = new BABYLON.PhysicsImpostor(this.ground, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 1});
        this.ground.position = new Vector3(this.fieldFimensions.x/2, 0, this.fieldFimensions.z/2);
        this.ground.metadata = "ground";
        this.ground.material = grassMaterial;
    }

    private getRootMesh(nodeUniqueId: number): Mesh {
        return this._scene.rootNodes.find((v)=>v.uniqueId == nodeUniqueId) as Mesh;
    }
    private stopAnimations(uniqueId: number) {
        const activeAnimations = this._scene.animationGroups.filter((v)=>v.isPlaying && v.name.split(this.SEPARATOR)[0] == uniqueId.toString());
        activeAnimations.forEach((v)=>v.stop())
    }
    private setAnimation(uniqueId: number, animationName: string, loop: boolean = true, stopPreviousAnimations: boolean = true) {
        if (stopPreviousAnimations) {
            this.stopAnimations(uniqueId);
        }
        var anim = this._scene.getAnimationGroupByName(this.getGroupAnimationName(uniqueId, animationName));
        anim.start(loop);
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
        let camera = new FreeCamera("camera1", new Vector3(this.fieldFimensions.x/2, 10, this.fieldFimensions.z+10), this._scene);
        camera.setTarget(new Vector3(this.fieldFimensions.x/2, 0, this.fieldFimensions.z*1/4))
        camera.attachControl(this._canvas, true);

        this._scene.gravity = new Vector3(0, this.GRAVITY / this.FPS, 0);
        this._scene.collisionsEnabled = true;
        this._scene.enablePhysics(new Vector3(0, this.GRAVITY, 0), new BABYLON.CannonJSPlugin(true, 10, CANNON));
        

        let counter = 0;
        for (let i = 5; i < this.fieldFimensions.z; i+=10) {
            for (let j = 5; j < this.fieldFimensions.x; j+=10) {
                ++counter;
                this.loadArcadian(counter, new Vector3(j, 5, i));
            }
        }
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