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
