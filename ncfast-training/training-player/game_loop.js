let canvas =<HTMLCanvasElement>document.getElementById('main');
let c = canvas.getContext('2d');

function init(): void {
   // initializatiion
   update();
}

function update(): void {
   // recalculate and render graphics
   requestAnimationFrame(update);
}

init();


var canvas = undefined;
var canvasContext = undefined;

function start() {
   canvas = document.getElementById("main");
   canvasContext = canvas.getContext("2d");
   mainLoop();
   
}canvas

document.addEventListener('DOMContentModel', start);

function update() {

}

function draw() {

}

function mainLoop() {
   canvasContext.fillStyle = "blue";
   canvasContext.fillRect(0, 0, canvasWidth, canvasHeight);
   update();
   draw();
   window.setTimeout(mainLoop, 1000/60);
   
}


