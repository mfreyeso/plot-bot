var plotbot = require("./plotbot.js");

var canvas = document.getElementById("canvas1");
// var imageData = context.createImageData(canvas.width, canvas.height);

var virtualBot = {
    cursorPos: [0,0], // this is the current position in relative Cartesian coordinates.
    lineColor: "rgba(190, 36, 210, 0.6)",
    scaleFactor: 1, //this will be changed up update event. it's pixels/Cartesian
};

virtualBot.cartesianToPixel = function(coords) {
    // Convert relative Cartesian coordinates [x,y]
    // to pixel coordinates for the <canvas>: [x_pix, y_pix]
    return [coords[0]*this.scaleFactor, coords[1]*this.scaleFactor];
};

virtualBot.pixelToCartesian = function(coords) {
    // Convert relative Cartesian coordinates [x,y]
    // to pixel coordinates for the <canvas>: [x_pix, y_pix]
    return [coords[0]/this.scaleFactor, coords[1]/this.scaleFactor];
};

virtualBot.updateCursor = function(dest) {
    // takes the server's response containing {x:123, y:234}
    // where x & y are relative Cartesian coordinates.
    // Draws a line from the previous position to the destination,
    // converting to pixel coordinates.
    var startPos = this.cartesianToPixel(this.cursorPos);
    var destPos = this.cartesianToPixel([dest.x, dest.y]);

    var context = canvas.getContext("2d");

    context.beginPath();
    context.moveTo(startPos[0], startPos[1]);
    context.lineTo(destPos[0], destPos[1]);
    context.strokeStyle = this.lineColor;
    context.stroke();
    // update virtual cursor
    this.cursorPos = [dest.x, dest.y];
};

function canvasMouseUp(event) {
  // draw a line from the "current position" stepDelta to given destDelta.
  var mouseupCoords = [event.pageX - canvas.offsetLeft, event.pageY - canvas.offsetTop];

  drawStraightLine(mouseupCoords[0], mouseupCoords[1], function(){
      console.log('line drawn.');
  });
}

// canvas.addEventListener("mousedown", canvasMouseDown);
canvas.addEventListener("mouseup", canvasMouseUp);

document.body.onkeydown = function(event){
    event = event || window.event;
    var keycode = event.charCode || event.keyCode;
    if(keycode === 68){
      //"d" key
      // l_step_retract();
      step(-1,0);
    }
    if(keycode === 70){
      //"f" key
      // l_step_extend();
      step(1,0);
    }
    if(keycode === 75){
      //"k" key
      // r_step_retract();
      step(0,-1);
    }
    if(keycode === 74){
      //"j" key
      // r_step_extend();
      step(0,1);
    }
};

function scaleCanvas(height, width) {
    // scale the <canvas> to a given height and width,
    // within max thresholds in pixels.
    //
    // Also, update the scaling factor:
    // rel. cartesian * scaleFactor -> canvas pixels

    var MAX_HEIGHT = 600;
    var MAX_WIDTH = 1000;
    var given_aspect = height/width;
    var max_aspect = MAX_HEIGHT/MAX_WIDTH;
    var scaleFactor;

    if (given_aspect <= max_aspect) {
        // given rectangle size is shorter & broader
        // (or the same)
        // so give it the maximum width
        scaleFactor = MAX_WIDTH/width;
        canvas.height = height * scaleFactor;
        canvas.width = MAX_WIDTH;
    } else {
        // given rect is taller and skinnier
        // so give it max height
        scaleFactor = MAX_HEIGHT/height;
        canvas.height = MAX_HEIGHT;
        canvas.width = width * scaleFactor;
    }

    console.log('height, width: ' + canvas.height, canvas.width);
    console.log('scale is ' + scaleFactor);

    virtualBot.scaleFactor = scaleFactor;
}

// Begin socket.io connection (auto-discovery)
var socket = io();

socket.on('update', function(data) {
    // Get an updated cursor position and canvas (drawing area) dimensions from server
    console.log("update from server: ", data);
    virtualBot.cursorPos = data.coords;
    scaleCanvas(data.canvasHeight, data.canvasWidth);
});

function step(stepsLeft, stepsRight) {
    // Performs a single step with one or both motors.
    // Currently only used by d/f/j/k keypress events.
    //steps is positive -> extend string
    //steps is negative -> retract string

    // if (!isInt(stepsLeft) || !isInt(stepsRight)) {
    //   throw new Error("Steps must be an integer! Got " + stepsLeft + ", " + stepsRight);
    // }

    if((stepsLeft !== 0 && Math.abs(stepsLeft) !== 1 ) ||
    (stepsRight !== 0 && Math.abs(stepsRight) !== 1)) {
        throw new Error("Steps can only be -1, 0, or 1");
    }

    // Emit a step event to the server
    console.log("requesting step from server...");
    socket.emit('step', {'stepsLeft':stepsLeft, 'stepsRight': stepsRight}, function(response) {
        if (response.status == "ok") {
            console.log("got OK from server");
            console.log(response);
            virtualBot.updateCursor(response.dest);
        } else {
            console.log("non-ok response from server:");
            console.log(response);
        }
    });
}

function drawStraightLine(x_pix, y_pix, callback) {
    // Draws an approximately straight line with both motors simultaneously.
    // (x_pix,y_pix) is the destination in pixel coordinates.

    // The robot's real-life line isn't perfect,
    // but we draw it as a straight line on the canvas.

    // convert to relative Cartesian coordinates
    cartesianCoords = virtualBot.pixelToCartesian([x_pix, y_pix]);

    console.log("requesting straight line mvmt from server...");
    socket.emit('line', {x:cartesianCoords[0], y:cartesianCoords[1]}, function(response){
        if (response.status == 'ok') {
            console.log('ok line from server');
            console.log(response);
            virtualBot.updateCursor(response.dest);

            // execute the callback
            callback();
        } else {
            console.log('line error from server: ', response);
        }
    });
}

function drawPoints(points) {
    console.log('beginning drawPoints');
    // TODO: make a version compatible with both points from bezier and points from opentype.js
    var DELAY_BTW_COMMANDS = 10; //TODO: this should be a plotbot property...

    function drawLoop(drawIndex) {
        if (drawIndex >= points.length) {
            // break out of callback loop
            console.log('exiting drawLoop');
            return false;
        }
        var nextCoords = [points[drawIndex].x, points[drawIndex].y];
        console.log('nextCoords (relative cartesian):');
        console.log(nextCoords);
        drawStraightLine(nextCoords[0], nextCoords[1], function(){
            setTimeout(function(){
                drawLoop(drawIndex+1);
            }, plotbot.DELAY_BTW_COMMANDS);
        });
    }
    // Start drawLoop callback cycle
    drawLoop(0);
}

function getBoundingBox(points){
    // Get the bounding box of an array of points
    // all values are in PIXELS
    var x_vals = _.map(points, 'x');
    var y_vals = _.map(points, 'y');

    return {
        x0: _.min(x_vals),
        x: _.max(x_vals),
        y0: _.min(y_vals),
        y: _.max(y_vals),
        CANVAS_WIDTH: canvas.width,
        CANVAS_HEIGHT: canvas.height,
    };
}

function withinBounds(bounds) {
    if (bounds.x > bounds.CANVAS_WIDTH ||
        bounds.y > bounds.CANVAS_HEIGHT ||
        bounds.x0 < 0 || bounds.y0 < 0) {
        return false;
    }
    return true;
}
// All exports
exports.virtualBot = virtualBot;
exports.scaleCanvas = scaleCanvas;
exports.step = step;
exports.drawStraightLine = drawStraightLine;
exports.drawPoints = drawPoints;
exports.getBoundingBox = getBoundingBox;
exports.withinBounds = withinBounds;
