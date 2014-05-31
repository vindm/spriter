var Spriter = require('../');

Spriter
    // create base sprite
    .make({
        src : [
            __dirname + '/_images/a/**',
            __dirname + '/_images/b/1.png',
            __dirname + '/_images/c/1.gif'
        ],
        out : __dirname + '/sprited',
        name : 'create',
        padding : [ 2, 4 ]
    })
    .spread(function(images, sprites) {
        console.log('done');
    });
