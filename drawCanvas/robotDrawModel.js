// TODO: Make a namespace for the canvas variables
var canvas = document.getElementById("canvas1");
var context = canvas.getContext("2d");
var imageData = context.createImageData(canvas.width, canvas.height);

// Begin socket.io connection (auto-discovery)
var socket = io();
console.log("TODO: get robot coordinates from server upon connection");

// canvas.addEventListener("mousedown", canvasMouseDown);
canvas.addEventListener("mouseup", canvasMouseUp);

// function canvasMouseDown(event) {
//   // WARNING: this is not robust. If the canvas is not positioned relative to
//   // the whole page (not nested), and maybe if you scroll, it can cause problems.
//   var coords = [event.pageX - canvas.offsetLeft, event.pageY - canvas.offsetTop];
//   // console.log(coords);
//   // return coords;
//   stepDelta = getBipolarCoords(coords[0], coords[1]);
// }

function canvasMouseUp(event) {
  // draw a line from the "current position" stepDelta to given destDelta.
  var mouseupCoords = [event.pageX - canvas.offsetLeft, event.pageY - canvas.offsetTop];

  drawStraightLine( getBipolarCoords(mouseupCoords[0], mouseupCoords[1]), function(){
      console.log('line drawn.');
  });
}

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

//==============TODO: Separate into diff files??? ==============//

var plotBot = {};

plotBot.STEP_LEN = 10;

// Cartesian resolution sets the granularity when approximating a straight line.
// =STEP_LEN*4 is a rule of thumb, it can be set differently depending on the drawing
// and configuration.
plotBot.CARTESIAN_RESOLUTION = plotBot.STEP_LEN * 4;

// Color as used by context.strokeStyle (right now, used only by drawSubsteps)
plotBot.COLOR = "rgba(255,0,0,0.25)";

// horizontal dist btw the 2 stepper motors.
plotBot.WIDTH = canvas.width;

// Keep track of steps from the origin position for left and right motors.
// it should always be an integer. Negative values are OK.
// TODO: store this variable in the plotBot namespace
// XXX: this value is about center, for the original board resolution & size. May change.
var stepDelta = [45, -29];

function isInt(value) {
  // from krisk on http://stackoverflow.com/questions/14636536/how-to-check-if-a-variable-is-an-integer-in-javascript
  return !isNaN(value) && (function(x) { return (x | 0) === x; })(parseFloat(value));
}

function intChunk(total, segments) {
  // Given a total value (integer) and a number of segments, build an array of integers
  // which are as close as possible to each other, which sum to the given total.
  // Eg intChunk(20,8) --> [ 3, 3, 3, 3, 2, 2, 2, 2 ].
  // Negative values for 'total' are fine -- all the elements will be negative

  // This is useful when chunking steps to draw a line in a Bresenham-inspired way!

  if (segments < 0 || !isInt(segments)) {
    throw new Error("intChunk needs 'segments' to be a positive integer. Got " + segments);
  }

  if (total === 0 || !isInt(total)) {
    throw new Error("intChunk needs nonzero integer 'total'. Got " + total);
  }

  // Create and populate chunkArray with minimum values
  var chunkArray = [];
  var isPositive = (total > 0);
  // Math.floor rounds negative numbers up: -2.5 --> -3. So use Math.ceil for negatives.
  var initialVal = isPositive ? Math.floor(total/segments) : Math.ceil(total/segments);
  for (var i=0; i<segments; i++) {
    chunkArray.push(initialVal);
  }

  // Go thru array incrementing each element by 1 (if positive) or -1 (if neg)
  // until the sum of the array reaches the value or 'sum'.
  var signedAdder = isPositive ? 1 : -1;
  var runningSum = Math.abs(initialVal * segments);
  var index = 0;
  while (runningSum < Math.abs(total)) {
    chunkArray[index] += signedAdder;
    index = (index + 1 == segments) ? 0 : index + 1;
    runningSum++;
  }

  return chunkArray;
}

  // TODO: Make another function that divides a cartesian line into samples,
  // Use plotBot.CARTESIAN_RESOLUTION to determine how many samples to make,
  // each sample is an arc where the endpoints are integer bipolar approximations
  // of the cartesian line.

function moveRobotTo(destDelta) {
  // Negotiate a "symmetrical" path of step()'s to get from current stepDelta
  // to destDelta (destination): prefers to move both motors at once, and to
  // distribute the single-motor motions evenly along the path.

  // XXX: This is really just for the HTML canvas simulator, the steppers can be run simultaneously & asychronously with johnny-five... maybe.

  // TODO: Verify that the destDelta is an array of 2 integers, and that it is
  // within the bounds of the drawing area.

  var stepDisplacement, stepDirection;
  var totalSteps, totalDualSteps, totalSingleSteps, singleStepMotorIndex;
  var biggerStepIndex, smallerStepIndex;
  var primaryMvmt, secondaryMvmt;
  var primaryIsDual;

  stepDisplacement = _.map(stepDelta, function(currentVal,index) {
    return destDelta[index] - currentVal;
  });

  stepDirection = _.map(stepDisplacement, function(steps) {
    if (steps < 0) return -1;
    else if (steps > 0) return 1;
    else return 0;
  });

  totalSteps = _.map(stepDisplacement, function(steps) {
    return Math.abs(steps);
  });

  if (totalSteps[0] >= totalSteps[1]) {
    biggerStepIndex = 0;
    smallerStepIndex = 1;
  } else {
    biggerStepIndex = 1;
    smallerStepIndex = 0;
  }
  singleStepIndex = biggerStepIndex;
  totalSingleSteps = totalSteps[biggerStepIndex] - totalSteps[smallerStepIndex];
  totalDualSteps = totalSteps[smallerStepIndex];

  if (totalDualSteps === 0 || totalSingleSteps === 0) {
    secondaryMvmt = [];
    if (totalDualSteps === totalSingleSteps) {
      // TODO: moveRobotTo gets 0 steps all the time. Handle this earlier!
      console.log("weird, moveRobotTo got 0 steps...");
      return false;
    }
    else if (totalDualSteps > totalSingleSteps) {
      primaryMvmt = [totalDualSteps];
      primaryIsDual = true;
    } else {
      primaryMvmt = [totalSingleSteps];
      primaryIsDual = false;
    }
  }
  else if (totalDualSteps < totalSingleSteps) {
    secondaryMvmt = intChunk(totalDualSteps, totalDualSteps);
    primaryMvmt = intChunk(totalSingleSteps, totalDualSteps+1);
    primaryIsDual = false;
  } else {
    secondaryMvmt = intChunk(totalSingleSteps, totalSingleSteps);
    primaryMvmt = intChunk(totalDualSteps, totalSingleSteps+1);
    primaryIsDual = true;
  }

  // console.log({primaryMvmt:primaryMvmt, secondaryMvmt:secondaryMvmt});


  function dualStep() {
    // stepDelta = _.map(stepDelta, function(currentVal, index){
    //   return currentVal + stepDirection[index];
    // });
    step(stepDirection[0], stepDirection[1]);
  }

  function singleStep() {
    // stepDelta[singleStepIndex] += stepDirection[singleStepIndex];
    if (singleStepIndex === 0) {
      step(stepDirection[0],0);
    } else {
      step(0, stepDirection[1]);
    }
  }

  // move the canvas "cursor" to the beginning stepDelta
  context.beginPath();
  context.strokeStyle = "rgba(255,0,100,1)";
  context.moveTo(stepDelta[0], stepDelta[1]);

  _.forEach(secondaryMvmt, function(secondarySteps,index) {
    if (primaryIsDual) {
      // execute primary mvmt. it's dual.
      _.times(primaryMvmt[index], dualStep);

      // execute secondary mvmt. it's single.
      // since secondary mvmt contains only one step, just call it once.
      singleStep();
    }
    else {
      // primary is singleStep, secondary mvmt is dualStep.
      _.times(primaryMvmt[index], singleStep);
      dualStep();
    }

  });
  // there's always one more movement chunk in primaryMvmt than in secondaryMvmt
  // so make that last movement now:
  // TODO use _.last(primaryMvmt) instead
    if (primaryIsDual) {
      _.times(primaryMvmt[primaryMvmt.length - 1], dualStep);
    } else {
      _.times(primaryMvmt[primaryMvmt.length - 1], singleStep);
    }

    // debug!
    // console.log("robot moved to");
    // console.log(stepDelta.slice(0));

    if(stepDelta[0] !== destDelta[0] || stepDelta[1] !== destDelta[1]) {
      console.log("...but should have moved to step delta " + destDelta[0] + ", " + destDelta[1]);
      console.log("moveRobotTo() did not wind up at destination!");
    }
}

function step(stepsLeft, stepsRight) {
    // Performs a single step with one or both motors.
    //steps is positive -> extend string
    //steps is negative -> retract string

    // if (!isInt(stepsLeft) || !isInt(stepsRight)) {
    //   throw new Error("Steps must be an integer! Got " + stepsLeft + ", " + stepsRight);
    // }

    if((stepsLeft !== 0 && Math.abs(stepsLeft) !== 1 ) ||
    (stepsRight !== 0 && Math.abs(stepsRight) !== 1)) {
        throw new Error("Steps can only be -1, 0, or 1");
        // console.log("Warning: multiple steps at once...");
    }

    // Emit a step event to the server
    console.log("requesting step from server...");
    socket.emit('step', {'stepsLeft':stepsLeft, 'stepsRight': stepsRight}, function(response) {
        if (response.ok) {
            console.log("got OK from server");

            var prevStepDelta = stepDelta.slice();

            //Update stepDelta with new position
            stepDelta[0] += stepsLeft;
            stepDelta[1] += stepsRight;

            var newStepDelta = stepDelta.slice();

            updateCursor();
            drawSubsteps(prevStepDelta,newStepDelta);
        } else {
            console.log("non-ok response from server");
            console.log(response);
        }
    });
}

function cartesianLength(x0, y0, x1, y1) {
    // the distance formula!
    return Math.sqrt(Math.pow(x1-x0,2)+Math.pow(y1-y0,2));
}

function drawSubsteps(prevStepDelta,newStepDelta) {
  // Draw the sampled points across the displacement
  var coords;
  var substepResolution = 4; //for spotty dotty trace, use 2.
  var deltaDiff = [];

  context.strokeStyle = plotBot.COLOR;

  for (var diff_i = 0; diff_i < 2; diff_i++) {
    deltaDiff[diff_i] = newStepDelta[diff_i] - prevStepDelta[diff_i];
  }
  var biggestDiff = Math.abs(deltaDiff[0]) > Math.abs(deltaDiff[1]) ? Math.abs(deltaDiff[0]) : Math.abs(deltaDiff[1]);
  var totalSubsteps = biggestDiff*substepResolution;

  function subStepMap(substep_i, index) {
    return prevStepDelta[index] + ((newStepDelta[index] - prevStepDelta[index]) * substep_i / totalSubsteps);
  }

  for (var substep_i = 0; substep_i < totalSubsteps; substep_i++) {
    // this should take the step directions as input, and draw a certain number
    // of points between those directions.

    tempStepDelta = _.map([substep_i,substep_i], subStepMap);

    coords = getCartesian(tempStepDelta);
    drawCircle(coords.x, coords.y, 1);
  }
}

function getBipolarCoords(x,y) {
  var steps_l = Math.sqrt(Math.pow(x,2) + Math.pow(y,2)) / plotBot.STEP_LEN;
  var steps_r = (Math.sqrt(Math.pow(plotBot.WIDTH - x,2) + Math.pow(y,2)) - plotBot.WIDTH) / plotBot.STEP_LEN;

  return [Math.round(steps_l), Math.round(steps_r)];
}

function getCartesian(someStepDelta) {
  //clone the array, it's not necessary - but just to be safe
  someStepDelta = someStepDelta.slice();

  //string lengths
  var s_l = someStepDelta[0]*plotBot.STEP_LEN;
  var s_r = someStepDelta[1]*plotBot.STEP_LEN + plotBot.WIDTH;

  //cartesian coords
  var x = (Math.pow(s_l, 2) - Math.pow(s_r, 2) + Math.pow(plotBot.WIDTH, 2) ) / (2 * plotBot.WIDTH);
  var y = Math.sqrt( Math.abs( Math.pow(s_l, 2) - Math.pow(x,2) ));

  return {x:x, y:y, s_l:s_l, s_r:s_r};
}


function updateCursor() {
  // FIXME bug: something weird happens when you pull
  // the line up too far (enough to "stretch" it)

  var coords = getCartesian(stepDelta);

  // draw the cursor position
  context.strokeStyle = "rgba(0, 0, 0, 0.10)";
  drawCircle(coords.x, coords.y, 3);
}


function drawArc(x,y,radius,startAngle,endAngle,counterClockwise) {
  context.beginPath();
  context.arc(x, y, radius, startAngle, endAngle, counterClockwise);
  context.stroke();
}

function drawCircle(x,y,radius) {
  context.beginPath();
  context.arc(x, y, radius, 0, 2*Math.PI, false);
  context.stroke();
}

// Draw the bipolar "grid".
for (var i = 0; i < 1000; i+=plotBot.STEP_LEN) {
  context.strokeStyle = "rgba(255, 0, 0, 0.10)";
  drawArc(0, 0, i, 0, 2*Math.PI, false);

  context.strokeStyle = "rgba(0, 0, 255, 0.10)";
  drawArc(plotBot.WIDTH, 0, i, 0, 2*Math.PI, false);
}

function drawStraightLine(destDelta, callback) {
    // Draws an approximately straight line with both motors simultaneously.
    // The robot's real-life line isn't perfect,
    // but we draw it as a straight line on the canvas.

    delta = {
        'leftDelta': destDelta[0] - stepDelta[0],
        'rightDelta': destDelta[1] - stepDelta[1]
    };

    console.log("requesting straight line mvmt from server...");
    socket.emit('line', delta, function(response){
        if (response.ok) {
            console.log('ok line from server');

            // Canvas draw, without using step()
            context.beginPath();
            var startCoords = getCartesian(stepDelta);
            var endCoords = getCartesian(destDelta);
            context.moveTo(startCoords.x, startCoords.y);
            context.lineTo(endCoords.x, endCoords.y);
            context.strokeStyle = "rgba(190, 36, 210, 0.6)";
            context.stroke();

            // update the stepDelta
            stepDelta = destDelta.slice();

            // execute the callback
            callback();
        } else {
            console.log('line error from server: ' + response);
        }
    });

}

// function drawStraightLine(destDelta) {
//   // draw an approximately straight line from current stepDelta
//   // to destDelta, by splitting up the cartesian line a given no of times
//   var coords0, coords1;
//   var x, x0, x1, y, y0, y1;
//   var allCoords;
//   var lineLength, timesToSplit;
//
//   currentCoords = getCartesian(stepDelta);
//   destCoords = getCartesian(destDelta);
//
//   x0 = currentCoords.x;
//   y0 = currentCoords.y;
//   x1 = destCoords.x;
//   y1 = destCoords.y;
//
//   allCartesianCoords = [];
//   allBipolarCoords = [];
//
//   lineLength = cartesianLength(x0, y0, x1, y1);
//   timesToSplit = Math.ceil(lineLength / plotBot.CARTESIAN_RESOLUTION);
//   // console.log("splitting line of length " + lineLength + " into " + timesToSplit + " segments.");
//
//   if (x1-x0 === 0 && y1-y0 === 0) {
//     console.log("drawStraightLine got same coords, skipping.");
//   } else {
//     for(var i=0; i<=timesToSplit; i++) {
//       x = (x1-x0)*i/timesToSplit + x0;
//       y = (y1-y0)*i/timesToSplit + y0;
//
//       allCartesianCoords.push([x,y]);
//       allBipolarCoords.push(getBipolarCoords(x,y));
//     }
//   }
//
//   _.forEach(allBipolarCoords, function(coords) {
//     moveRobotTo(coords);
//     // debug: show the bipolar coords in red
//     var cartTemp = getCartesian(coords);
//     context.strokeStyle = "rgba(255,0,0,0.5)";
//     drawCircle(cartTemp.x, cartTemp.y, 1);
//   });
//
//   // debug: show the cartesian coords in black
//   context.strokeStyle = "rgba(0,0,0,0.5)";
//   _.forEach(allCartesianCoords, function (coords) {
//     drawCircle(coords[0], coords[1], 1);
//   });
//
// }

//===========DEBUG TESTS=============

// a horizonal-ish line
// plotBot.COLOR = "rgba(0,255,255,0.25)";
// stepDelta = [10,-5];
// moveRobotTo([57,-55]);

//==== horizonal-ish, lower. ====
// the ideal cartesian line
// context.strokeStyle = "pink";
// context.moveTo(79, 272);
// context.lineTo(627,269);
// context.stroke();
// // this is a "native" stepper line
// plotBot.COLOR = "rgba(0,0,255,0.25)";
// stepDelta = getBipolarCoords(79, 272);
// moveRobotTo(getBipolarCoords(627, 269));

// now try to approximate it
// plotBot.COLOR = "rgba(50,255,0,0.25)";
// plotBot.CARTESIAN_RESOLUTION = plotBot.STEP_LEN * 1;
// stepDelta = getBipolarCoords(79, 272);
// drawStraightLine(getBipolarCoords(627, 269));
//
// plotBot.COLOR = "rgba(0,255,0,0.25)";
// plotBot.CARTESIAN_RESOLUTION = plotBot.STEP_LEN * 5;
// stepDelta = getBipolarCoords(79, 290);
// drawStraightLine(getBipolarCoords(627, 290));
//
// plotBot.COLOR = "rgba(0,0,255,0.25)";
// plotBot.CARTESIAN_RESOLUTION = plotBot.STEP_LEN * 10;
// stepDelta = getBipolarCoords(79, 315);
// drawStraightLine(getBipolarCoords(627, 315));
//
// plotBot.COLOR = "rgba(255,0,255,0.25)";
// plotBot.CARTESIAN_RESOLUTION = plotBot.STEP_LEN * 15;
// stepDelta = getBipolarCoords(79, 330);
// drawStraightLine(getBipolarCoords(627, 330));
