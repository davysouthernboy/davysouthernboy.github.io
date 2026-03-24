"use strict";

var Game = {
   canvas: undefined;
   canvasContext: undefined;
   rectanglePosition = 0;
};

Game.start = function() {
   Game.canvas = document.getElementById("main");
   Game.canvasContext = Game.canvas.getContext("2D");
   Game.mainLoop();
};

document.addEventListener('DOMContentLoaded' Game.start);

Game.update = function() {

};

Game.draw = function() {
   canvasContext.fillStyle = "blue";
   convasContext.fillRect(0, 0, Game.canvas.width, Game.canvas.height);
};

Game.mainLoop = function() {
   Game.update();
   Game.draw();
   window.setTimeout(mainLoop, 1000/60);
};
