import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders/glTF";
import * as BABYLON from "@babylonjs/core/Legacy/legacy";
import mergeImages from 'merge-images';

import { Engine, Scene, Vector3, Mesh, HemisphericLight, Color3, Color4, FreeCamera, Sound, Effect, SceneLoader } from "@babylonjs/core";
import { AdvancedDynamicTexture, Button, TextBlock, Rectangle, Control, Image } from "@babylonjs/gui";
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
//enum for states
enum State { START = 0, GAME = 1, LOSE = 2, CUTSCENE = 3 }

class App {
    // General Entire Application
    private _scene: Scene;
    private _canvas: HTMLCanvasElement;
    private _engine: Engine;

    //Scene - related
    private SEPARATOR = '_';

    private selectedCharacterId: number;

    private _stack: SlotMap[];

    private ground: Mesh;
    private _projetile: Mesh;
    private _selectedMark: Mesh;

    private fieldFimensions = new Vector3(30, 0, 15)
    private FPS = 60;
    private GRAVITY = -9.81;

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
        
        this._stack = (await fetch("stack.json").then((res)=>res.json())).stack.stack.stack

        this.createScene();

        this.createTerrain();

        this.setupSelectedMark();

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
                    this.shotNearestEnemy(this.selectedCharacterId);
                }
            }
        });
    }

    private startSelectedMarkAnim(parentUniqueId: number) {
        const parentMesh = this.getRootMesh(parentUniqueId)
        this._selectedMark.setEnabled(true);
        this._selectedMark.parent = parentMesh;
        this._selectedMark.position.y = parentMesh.getBoundingInfo().maximum.y + 0.6;
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
        projetile.position = new Vector3(10, 2, 2);
        projetile.setEnabled(false);
        this._projetile = projetile;
    }

    private cloneProjectile(): Mesh {
        const clone = this._projetile.clone("projectileClone");
        clone.physicsImpostor = new BABYLON.PhysicsImpostor(clone, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 1, restitution: 0.1, friction: 0});
        clone.actionManager = new BABYLON.ActionManager(this._scene);
        clone.physicsImpostor.registerOnPhysicsCollide(
            this.ground.physicsImpostor, 
            ()=>{
                setTimeout(() => {
                    clone.dispose();
                }, 2000);
            }
        );
        clone.setEnabled(true);
        return clone;
    }

    private shotNearestEnemy(characterUniqueId: number) {
        const characterMesh = this.getRootMesh(characterUniqueId);
        
        const targets = this._scene.getMeshesByTags("arcadian").filter((v)=>v.uniqueId != characterMesh.uniqueId);
        if (!targets || targets.length == 0) 
            return;

        targets.sort((a, b)=>a.position.subtract(characterMesh.position).length() - b.position.subtract(characterMesh.position).length())
        let nearestTarget: BABYLON.Mesh;

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
                nearestTarget = targets[i];
                break;
            }
        }
        if (!nearestTarget)
            return;
        
        const deltaPosition = nearestTarget.position.subtract(characterMesh.position);
        characterMesh.scaling = new Vector3(-Math.sign(deltaPosition.x)*1, 1, 1);

        this.setAnimation(characterMesh.uniqueId, ANIMATION_LIST.attackAssassin, false, false)
        setTimeout(() => {
            const projectile = this.cloneProjectile();
            projectile.position = characterMesh.position.add(new Vector3(-Math.sign(characterMesh.scaling.x), 1, 0));
            projectile.physicsImpostor.physicsBody.angularDamping = 0.8;
            const force = deltaPosition.normalize().scale(8);
            projectile.physicsImpostor.applyImpulse(force, projectile.getAbsolutePosition());
        }, 300);
    }

    private async loadArcadian(arcadianId: number, position: Vector3 = Vector3.Zero()) {
        
        const metadataUrl = "https://arcadians.prod.outplay.games/v2/arcadians/" + arcadianId;
        const metadata = await fetch(metadataUrl).then((result)=>result.json())

        const attributes: MetadataSlot[] = metadata.attributes;

        // body to detect interactions
        const arcadianHeight = 2.7;
        let body = BABYLON.MeshBuilder.CreateCylinder("body", {diameter: 1.2, height: arcadianHeight});
        body.metadata = "arcadian";
        body.name = "arcadian_" + arcadianId;
        BABYLON.Tags.AddTagsTo(body, "arcadian");
        body.visibility = 0;
        body.position = position;
        body.physicsImpostor = new BABYLON.PhysicsImpostor(body, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 70, restitution: 0.3, friction: 0.3});
        body.physicsImpostor.physicsBody.angularDamping = 1;
        const nodeUniqueId = body.uniqueId;
        const {meshes, animationGroups} = await SceneLoader.ImportMeshAsync(null, "ArcadianAvatar", ".gltf", this._scene);
        const arcadianMesh = meshes[0];
        animationGroups[0].stop();
        arcadianMesh.setParent(body);
        arcadianMesh.position = new Vector3(0, -arcadianHeight/2, 0);
        arcadianMesh.isPickable = false;

        const childMeshes = arcadianMesh.getChildMeshes();
        for (const childMesh of childMeshes) {
            childMesh.isPickable = false;
        }
        for (const group of animationGroups) {
            group.name = nodeUniqueId + this.SEPARATOR + group.name
        }

        for (const att of attributes) {
            const slotName = att.trait_type;

            if (slotName == "Class" || slotName == "Gender" || slotName == "Background") 
                continue;

            const itemsSlot = this._stack.find((v)=>v.name == slotName)
            const itemSlot = itemsSlot.layer.find((v)=>v.name == att.value)

            const itemFilename = itemSlot.src.split("/")[1];
            const itemPath = "parts/" + itemFilename;
            const blankPath = "empty399x399.png";
            const textureImage = await mergeImages([blankPath, {src: itemPath, x: itemSlot.x, y: itemSlot.y}]);
            let tex = new BABYLON.Texture(textureImage, this._scene, true, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);

            tex.name = itemFilename;
            tex.hasAlpha = true;

            const matsMatch = this._scene.materials.filter((m)=>m.id == slotName)
            const lastMatch = matsMatch.at(-1)
            
            var material = this._scene.getMaterialByUniqueID(lastMatch.uniqueId, true);
            material.backFaceCulling = false;

            (material as any).albedoTexture = tex;
        }

        body.actionManager = new BABYLON.ActionManager(this._scene);
        body.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                    trigger: BABYLON.ActionManager.OnPickDownTrigger,
                },
                () => {
                    console.log("character selected")
                }
            )
        )
        this.setAnimation(nodeUniqueId, ANIMATION_LIST.idle, true, false);
    }

    private moveCharacter(nodeUniqueId: number, destination: Vector3) {
        const characterMesh = this.getRootMesh(nodeUniqueId);
        const speed = 4.5;
        let distance = destination.subtract(characterMesh.position);

        const arcadianPhysics = () => {
            distance = destination.subtract(characterMesh.position);
            distance.y = 0;
            if (distance.length() < 0.1) {
                // TODO: find another way to avoid mini jump at the end of walking
                characterMesh.physicsImpostor.registerAfterPhysicsStep(()=>{
                    characterMesh.physicsImpostor.setLinearVelocity(Vector3.Zero())
                });

                this.setAnimation(characterMesh.uniqueId, ANIMATION_LIST.idle);
                this._scene.unregisterBeforeRender(arcadianPhysics);
            }
            const velocity = distance.normalize().scale(speed);
            characterMesh.physicsImpostor.setLinearVelocity(velocity);
            characterMesh.physicsImpostor.setAngularVelocity(new Vector3(0,0,0));
        }

        this.setAnimation(nodeUniqueId, ANIMATION_LIST.walk);

        characterMesh.scaling = new Vector3(-Math.sign(distance.x)*1, 1, 1);

        this._scene.registerBeforeRender(arcadianPhysics);
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
        var anim = this._scene.getAnimationGroupByName(this.getAnimationGroupByName(uniqueId, animationName));
        anim.start(loop);
    }

    private getAnimationGroupByName(uniqueId: number, animationName: string) {
        return  uniqueId + this.SEPARATOR + animationName
    }

    private async createScene() {
        // initialize babylon scene and engine
        this._engine = new Engine(this._canvas, true);
        this._scene = new Scene(this._engine);

        var light1: HemisphericLight = new HemisphericLight("light1", new Vector3(this.fieldFimensions.x, this.fieldFimensions.x, this.fieldFimensions.z), this._scene);
        let camera = new FreeCamera("camera1", new Vector3(this.fieldFimensions.x/2, 10, this.fieldFimensions.z+5), this._scene);
        camera.setTarget(new Vector3(this.fieldFimensions.x/2, 0, this.fieldFimensions.z*1/4))
        camera.attachControl(this._canvas, true);

        this._scene.gravity = new Vector3(0, this.GRAVITY / this.FPS, 0);
        this._scene.collisionsEnabled = true;
        this._scene.enablePhysics(new Vector3(0, this.GRAVITY, 0), new BABYLON.CannonJSPlugin(true, 10, CANNON));
        

        let counter = 0;
        for (let i = 5; i < this.fieldFimensions.z; i+=10) {
            for (let j = 5; j < this.fieldFimensions.x; j+=10) {
                ++counter;
                await this.loadArcadian(counter, new Vector3(j, 5, i));
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
}
new App();