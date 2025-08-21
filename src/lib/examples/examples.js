export const templateSketch = `function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
}

function fabDraw() {
  console.log('fabdraw');
  fab.moveExtrude(100, 100, 0);
}

function midiSetup(midiData) {

}

function midiDraw(moveCommand) {

  return moveCommand;
}

function draw() {
  background(255);
  fab.render();
}`
