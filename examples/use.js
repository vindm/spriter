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
        name : 'use',
        padding : [ 2, 4 ]
    })
    .spread(function(images, sprites) {
        Spriter
            // use base sprite to get common images data
            .api({
                src : __dirname + '/_images/c/**',
                path : __dirname + '/sprited',
                name : 'use',
                ifexists : 'use'
            })
            .spread(function(images, sprites) {
                console.log('done!');
            });
    });
