var SPRITER = require('../index');

SPRITER
    .api({
        src : [
            __dirname + '/_images/a/**',
            __dirname + '/_images/b/1.png',
            __dirname + '/_images/c/1.gif'
        ],
        path : __dirname + '/sprited',
        name : 'create',
        padding : [ 2, 4 ]
    })
    .spread(function(images, sprites) {
        console.log('done');
    });
