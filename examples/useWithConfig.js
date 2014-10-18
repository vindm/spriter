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
        name : 'useWithConfig',
        padding : [ 2, 4 ]
    })
    .spread(function(images, sprites) {
        Spriter
            // use base sprite to get common images data
            // and create a new one for diff images
            .api({
                src : __dirname + '/_images/c/**',
                path : __dirname + '/sprited',
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
