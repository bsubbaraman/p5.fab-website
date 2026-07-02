export const templateSketch = `function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  // Set your printer, e.g.
  // fab.setPrinter('ender3');
}

function fabDraw() {
  // Author your artifact here!
  fab.autoHome(); // home all axes

}

function draw() {
  background(255);
  fab.render();
}
`
