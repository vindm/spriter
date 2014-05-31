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
        name : 'useWithConfig',
        padding : [ 2, 4 ]
    })
    .spread(function(images, sprites) {
        Spriter
            // use base sprite to get common images data
            // and create a new one for diff images
            .make({
                src : __dirname + '/_images/c/**',
                out : __dirname + '/sprited',
                name : 'useWithConfig',
                padding : [ 2, 4 ],
                ifexists : {
                    action : 'use',
                    config : {
                        name : 'useWithConfig_extra'
                    }
                }
            })
            .spread(function(images, sprites) {
                console.log('done!');
            });
    });
