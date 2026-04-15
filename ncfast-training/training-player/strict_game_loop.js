"use strict";

var Game = {
  canvas: undefined,
  canvasContext: undefined,
  rectanglePosition: 200,
  backgroundSprite:  undefined,
  balloonPosition: {x:50, y:50};
  backgroundMusic: undefined;
  ballonSprite: undefined,
  mousePosition: {x:0, y:0},
  balloonPosition:  {x:0, y:0}
};

Game.balloon = { x: Game.balloonSprite.width / 2,
                 y: Game.balloonHeight.height };

Game.start = function () {
  Game.canvas = document.getElementById("main");
  Game.canvasContext = Game.canvas.getContext("2d");
  Game.balloonSprite = new Image();
  Game.balloonSprite.src = "spr_balloon.png";
  Game.backgroundMusic = new Audio();
  Game.backgroundMusic.src = "sound.mp3"n
  window.setTimeout(Game.mainLoop(), 500);
};

document.addEventListener("DOMContentLoaded", Game.start);

Game.update = function () {
  var d = new Date();
  Game.balloonPosition.x = d.getTime() % Game.canvas.width;
};

Game.drawImage = function (sprite, position, origin) {
  Game.canvasContext.save();
  Game.canvasContext.translate(position.x, position.y);
  Game.canvasContext.drawImage(sprite, 0, 0, sprite.width, sprite.height, -origin.x, -origin.y, sprite.width, sprite.height);
  Game.canvasContext.restore();
};

Game.draw = function() {
   Game.drawImage(Game.backGroundSpite, {x: 0, y:0 }, {x:0, y:0});
   Game.balloonOrigin = { x: Game.balloonSprite.width / 2,
                 y: Game.balloonHeight.height };
   Game.drawImage(Game.balloonSprite, Game.mousePosition, Game.balloonOrigin);
}

Game.mainLoop = function () {
  Game.update();
  Game.draw();
  window.setTimeout(Game.mainLoop, 1000 / 30);
};
