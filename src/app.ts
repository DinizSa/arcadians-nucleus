import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders/glTF";
import * as BABYLON from "@babylonjs/core/Legacy/legacy";
import mergeImages from 'merge-images';

import { Engine, Scene, Vector3, Mesh, ArcRotateCamera, HemisphericLight, Color3, Color4, UniversalCamera, FollowCamera, ShadowGenerator, GlowLayer, PointLight, FreeCamera, CubeTexture, Sound, PostProcess, Effect, SceneLoader, Matrix, MeshBuilder, Quaternion, AssetsManager } from "@babylonjs/core";
import { AdvancedDynamicTexture, StackPanel, Button, TextBlock, Rectangle, Control, Image } from "@babylonjs/gui";

interface MetadataSlot {
    item_contract_address: string,
    item_id: number,
    trait_type: string,
    value: string,
    is_base_item: boolean
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
    private _state: number = 0;

    private _nodesIds: number[] = [];

    constructor() {
        this._canvas = this._createCanvas();


        // initialize babylon scene and engine
        this._engine = new Engine(this._canvas, true);
        this._scene = new Scene(this._engine);


        // var camera: ArcRotateCamera = new ArcRotateCamera("Camera", Math.PI / 2, Math.PI / 2, 2, Vector3.Zero(), this._scene);
        // camera.attachControl(true);



        // var light1: HemisphericLight = new HemisphericLight("light1", new Vector3(1, 1, 0), this._scene);
        // var sphere: Mesh = MeshBuilder.CreateSphere("sphere", { diameter: 1 }, this._scene);

        // hide/show the Inspector
        window.addEventListener("keydown", (ev) => {
            // Shift+Ctrl+Alt+I
            if (ev.shiftKey && ev.keyCode === 73) {
                if (this._scene.debugLayer.isVisible()) {
                    this._scene.debugLayer.hide();
                } else {
                    this._scene.debugLayer.show();
                }
            }
        });

        this._scene.onPointerDown = function (event, pickResult, type) {
            if (pickResult.pickedMesh && pickResult.pickedMesh.metadata == "arcadian") {
                console.log("Arcadian picked");
            }
        }

        this._main();
    }

    private async _main(): Promise<void> {

        // await this._goToStart();

        let arcadianNodeId1 = await this.loadArcadian(1);
        this.setPosition(arcadianNodeId1, new Vector3(2, 0, 0))
        
        let arcadianNodeId2 = await this.loadArcadian(400);
        this.setPosition(arcadianNodeId2, new Vector3(-2, 0, 0))
        
        this._scene.stopAllAnimations()
        this.setAnimation(arcadianNodeId1 + ANIMATION_LIST.talkPositive);
        this.setAnimation(arcadianNodeId2 + ANIMATION_LIST.talkNegative);
        
        var light1: HemisphericLight = new HemisphericLight("light1", new Vector3(0, 10, 0), this._scene);

        let camera = new FreeCamera("camera1", new Vector3(0, 0, 10), this._scene);
        camera.setTarget(new Vector3(0, 0, 0))
        camera.attachControl(this._canvas, true);

        // run the main render loop
        this._engine.runRenderLoop(() => {
            this._scene.render();
        });
    }

    private async loadArcadian(arcadianId: number) {
        const metadataUrl = "https://arcadians.prod.outplay.games/v2/arcadians/" + arcadianId;
        const metadata = await fetch(metadataUrl).then((result)=>result.json())
        const attributes: MetadataSlot[] = metadata.attributes;

        const stackResponse = (await fetch("stack.json").then((res)=>res.json()));
        const stack: SlotMap[] = stackResponse.stack.stack.stack

        const result = await SceneLoader.ImportMeshAsync(null, "ArcadianAvatar", ".gltf", this._scene)
        const nodeId = result.meshes[0].uniqueId;
        result.meshes[0].name = "arcadian_" + arcadianId;
        result.meshes[0].metadata = "arcadian"; // also add to the children, to inspect collisions later
        for (const group of result.animationGroups) {
            group.name = nodeId + group.name
        }

        for (const att of attributes) {
            const slotName = att.trait_type;

            if (slotName == "Class" || slotName == "Gender" || slotName == "Background") 
                continue;

            const itemsSlot = stack.find((v)=>v.name == slotName)
            const itemSlot = itemsSlot.layer.find((v)=>v.name == att.value)

            const itemFilename = itemSlot.src.split("/")[1];
            const itemPath = "parts/" + itemFilename;
            const blankPath = "empty399x399.png";
            const textureImage = await mergeImages([blankPath, {src: itemPath, x: itemSlot.x, y:itemSlot.y}]);

            let tex = new BABYLON.Texture(textureImage, this._scene, true, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
            tex.name = itemFilename;
            tex.hasAlpha = true;

            const matsMatch = this._scene.materials.filter((m)=>m.id == slotName)
            const lastMatch = matsMatch.at(-1)
            
            var mat = this._scene.getMaterialByUniqueID(lastMatch.uniqueId, true);

            (mat as any).albedoTexture = tex;
        }

        this._nodesIds.push(nodeId);

        return nodeId;
    }

    private getNode(nodeUniqueId: number): BABYLON.Node {
        return this._scene.rootNodes.find((v)=>v.uniqueId == nodeUniqueId);
    }
    private setScale(nodeUniqueId: number, vector3: Vector3) {
        (this.getNode(nodeUniqueId) as any).scaling = vector3;
    }
    private setPosition(nodeUniqueId: number, vector3: Vector3) {
        (this.getNode(nodeUniqueId) as any).position = vector3;
    }
    private setRotation(nodeUniqueId: number, vector3: Vector3) {
        (this.getNode(nodeUniqueId) as any).rotation = vector3;
    }
    private setAnimation(animationName: string, loop: boolean = true) {
        var anim = this._scene.getAnimationGroupByName(animationName);
        anim.start(loop);
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

    // goToStart
    private async _goToStart() {
        this._engine.displayLoadingUI(); //make sure to wait for start to load

        //--SCENE SETUP--
        //dont detect any inputs from this ui while the game is loading
        this._scene.detachControl();
        let scene = new Scene(this._engine);
        scene.clearColor = new Color4(0, 0, 0, 1);
        //creates and positions a free camera
        let camera = new FreeCamera("camera1", new Vector3(0, 0, 0), scene);
        camera.setTarget(Vector3.Zero()); //targets the camera to scene origin

        //--SOUNDS--
        const start = new Sound("startSong", "./sounds/copycat(revised).mp3", scene, function () {
        }, {
            volume: 0.25,
            loop: true,
            autoplay: true
        });
        const sfx = new Sound("selection", "./sounds/vgmenuselect.wav", scene, function () {
        });

        //--GUI--
        const guiMenu = AdvancedDynamicTexture.CreateFullscreenUI("UI");
        guiMenu.idealHeight = 720;

        //background image
        const imageRect = new Rectangle("titleContainer");
        imageRect.width = 0.8;
        imageRect.thickness = 0;
        guiMenu.addControl(imageRect);

        const startbg = new Image("startbg", "sprites/start.jpeg");
        imageRect.addControl(startbg);

        const title = new TextBlock("title", "SUMMER'S FESTIVAL");
        title.resizeToFit = true;
        title.fontFamily = "Ceviche One";
        title.fontSize = "64px";
        title.color = "white";
        title.resizeToFit = true;
        title.top = "14px";
        title.width = 0.8;
        title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        imageRect.addControl(title);

        const startBtn = Button.CreateSimpleButton("start", "PLAY");
        startBtn.fontFamily = "Viga";
        startBtn.width = 0.2
        startBtn.height = "40px";
        startBtn.color = "white";
        startBtn.top = "-14px";
        startBtn.thickness = 0;
        startBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        imageRect.addControl(startBtn);

        //set up transition effect : modified version of https://www.babylonjs-playground.com/#2FGYE8#0
        Effect.RegisterShader("fade",
            "precision highp float;" +
            "varying vec2 vUV;" +
            "uniform sampler2D textureSampler; " +
            "uniform float fadeLevel; " +
            "void main(void){" +
            "vec4 baseColor = texture2D(textureSampler, vUV) * fadeLevel;" +
            "baseColor.a = 1.0;" +
            "gl_FragColor = baseColor;" +
            "}");

        //--SCENE FINISHED LOADING--
        await scene.whenReadyAsync();
        this._engine.hideLoadingUI(); //when the scene is ready, hide loading
        //lastly set the current state to the start state and set the scene to the start scene
        this._scene.dispose();
        this._scene = scene;
        this._state = State.START;
    }
}
new App();