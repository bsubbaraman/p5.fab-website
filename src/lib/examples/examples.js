export const templateSketch = `function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
}

function fabDraw() {
  fab.autoHome();
  fab.moveExtrude(100, 100, 0);
}

function draw() {
  background(255);
  fab.render();
}`
