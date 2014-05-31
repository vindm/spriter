var SPRITER = require('./spriter'),
    PATH = require('path'),
    FS = require('fs');

module.exports = require('coa').Cmd()
    .name(process.argv[1])
    .title('Spriter. Just Spriter.')
    .helpful()
    .opt()
        .name('version').title('Version')
        .short('v').long('version')
        .flag()
        .only()
        .act(function() { return JSON.parse(FS.readFileSync(PATH.resolve(__dirname, '..', 'package.json'))).version; })
        .end()
    .opt()
        .name('src').title('Glob strings to find source images to put into the sprite')
        .short('s').long('src')
        .arr()
        .end()
    .opt()
        .name('path').title('Path of output directory to write sprite file to')
        .short('o').long('output_path')
        .end()
    .opt()
        .name('name').title('Name of sprite file')
        .short('n').long('name')
        .end()
    .opt()
        .name('ifexists').title('Ifexist action')
        .short('i').long('ifexists')
        .end()
    .opt()
        .name('layout').title('Layout')
        .short('l').long('layout')
        .end()
    .opt()
        .name('padding').title('Padding')
        .short('p').long('padding')
        .end()
    .arg()
        .name('src').title('alias to --src')
        .arr()
        .end()
    .act(function(opts, args) {
        if (args.src) {
            opts.src = args.src;
        }

        if ( ! opts.src || opts.src.length === 0) {
            return this.reject('Require at least one source image for spriting');
        }

        return SPRITER.make(opts);
    });
