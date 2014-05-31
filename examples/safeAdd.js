var Spriter = require('../index');

Spriter
    // create base sprite
    .api({
        src : [
            __dirname + '/_images/a/**',
            __dirname + '/_images/b/1.png',
            __dirname + '/_images/c/1.gif'
        ],
        path : __dirname + '/sprited',
        name : 'safeAdd',
        padding : [ 2, 4 ]
    })
    .spread(function(images, sprites) {
        Spriter
            // add images to base sprite, ensure saving previous positions
            .api({
                src : [
                    __dirname + '/_images/b/**',
                    __dirname + '/_images/c/1.gif'
                ],
                path : __dirname + '/sprited',
                name : 'safeAdd',
                ifexists : 'safeAdd'
            })
            .spread(function(images, sprites) {
                console.log('done!');
            });
    });
