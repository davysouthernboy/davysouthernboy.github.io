let currMoleTile;
let currPlantTile;
let score = 0;
let gameOver = false;


window.onload = function() {
   setGame();
}

function setGame() {
  // set up the grid for game board in html
  for (let i = 0; i < 9; i++) {
     let tile = document.createElement("div");
     tile.id = i.toString();
     tile.addEventListener("click", selectTile);
     document.getElementById("board").appendChild(tile);
   }
   
   setInterval(setMole, 1000);
   setInterval(setPlant, 2000);
}

function setMole() {

  if (gameOver) { 
    return;
  }

  if (currMoleTile) {
    currMoleTile.innerHTML = "";
  }
  let mole = document.createElement("img");
  mole.src = "./davie.png";
  let num = getRandomTile();
  if (currPlantTile && currPlantTile.id == num) {
    return;
  }
  currMoleTile = document.getElementById(num);
  currMoleTile.appendChild(mole);
}

function setPlant() {

  if (gameOver) { 
    return;
  }

  if (currPlantTile) {
    currPlantTile.innerHTML = "";
  }
  let plant = document.createElement("img");
  plant.src = "./alien-venus-flytrap.png";
  let num = getRandomTile();
    if (currMoleTile && currMoleTile.id == num) {
    return;
  }
  currPlantTile = document.getElementById(num);
  currPlantTile.appendChild(plant);
}


function getRandomTile() {
   let num = Math.floor(Math.random() * 9);
   return num.toString();
}

function selectTile() {

  if (gameOver) { 
    return;
  }

  if (this == currMoleTile) {
    score += 10;
    document.getElementById("score").innerText = score.toString();
  }
  else if (this == currPlantTile) {
    document.getElementById("score").innerText = "GAME OVER: " + score.toString();
    gameOver = true;
  }
   
}
