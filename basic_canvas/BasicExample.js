changeCanvasColor = function() {
   var canvas = document.getElementById("mycanvas");
   var context = canvas.getContext("2d");
   context.fillStyle = "blue";
   context.fillRect(0, 0, canvas.width, canvas.height);
}
document.addEventListener('DCOMContentLoaded', changeCanvasColor);
