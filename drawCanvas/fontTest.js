console.log("running font drawing test!");

opentype.load('fonts/candy_shop/Candy\ Shop\ Black.ttf', function(err, font) {
    if (err) {
        alert('Could not load font: ' + err);
    } else {
        // Use your font here.
        var ctx = document.getElementById('canvas1').getContext('2d');
        // Construct a Path object containing the letter shapes of the given text.
        // The other parameters are x, y and fontSize.
        // Note that y is the position of the baseline.
        var path = font.getPath('hai', 100, 350, 200);
        // If you just want to draw the text you can also use font.draw(ctx, text, x, y, fontSize).

        // DEBUG: show the stroke of the text
        show_stroke = true;
        if (show_stroke) {
            path.fill = null;
            path.stroke = 'rgba(0,255,0,0.25)';
            path.draw(ctx);
        }
        cmds = path.commands

        // path.commands has x y coords, all except the last
        for (i = 0; i < cmds.length; i++) {
            if (cmds[i].type != 'Z') {
                // XXX: drawStraightLine is probably better, test IRL
                drawStraightLine(getBipolarCoords(cmds[i].x,cmds[i].y));
                // moveRobotTo(getBipolarCoords(cmds[i].x,cmds[i].y));
            }
        }
    }
});
