#!/usr/bin/env node

const _proggers = require('cli-progress'),
    _commander = require('commander'),
    _colors = require('colors'),
    _fs = require('fs'),
    _$ = require('cheerio'),
    _url = require('url'),
    _https = require('https'),
    _axios = require('axios'),
    _async = require('async'),
    _math = require('mathjs'),
    _version = require('./package.json').version

// https://stackoverflow.com/a/25651291/10999871
// pBytes: the size in bytes to be converted.
// pUnits: 'si'|'iec' si units means the order of magnitude is 10^3, iec uses 2^10

function prettyNumber(pBytes, pUnits) {
    // Handle some special cases
    if(pBytes == 0) return '0 Bytes';
    if(pBytes == 1) return '1 Byte';
    if(pBytes == -1) return '-1 Byte';

    var bytes = Math.abs(pBytes)
    if(pUnits && pUnits.toString().toLowerCase() && pUnits.toString().toLowerCase() == 'si') {
        // SI units use the Metric representation based on 10^3 as a order of magnitude
        var orderOfMagnitude = Math.pow(10, 3);
        var abbreviations = ['Bytes', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    } else {
        // IEC units use 2^10 as an order of magnitude
        var orderOfMagnitude = Math.pow(2, 10);
        var abbreviations = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    }
    var i = Math.floor(Math.log(bytes) / Math.log(orderOfMagnitude));
    var result = (bytes / Math.pow(orderOfMagnitude, i));

    // This will get the sign right
    if(pBytes < 0) {
        result *= -1;
    }

    // This bit here is purely for show. it drops the percision on numbers greater than 100 before the units.
    // it also always shows the full number of bytes if bytes is the unit.
    if(result >= 99.995 || i==0) {
        return result.toFixed(0) + ' ' + abbreviations[i];
    } else {
        return result.toFixed(2) + ' ' + abbreviations[i];
    }
}

exports.GetLink = async (u) => {
    console.log('⏳  ' + _colors.yellow(`Get Page From : ${u}`))
    const zippy = await _axios({ method: 'GET', url: u }).then(res => res.data).catch(err => false)
    const $ = _$.load(zippy)
    if (!$('#dlbutton').length) {
        return { error: true, message: $('#lrbox>div').first().text().trim() }
    }
    console.log('⏳  ' + _colors.yellow('Fetch Link Download...'))
    const url = _url.parse($('.flagen').attr('href'), true)
    const urlori = _url.parse(u)
    const key = url.query['key']
    let time;
    let dlurl;
    try {
        time = /var b = ([0-9]+);$/gm.exec($('#dlbutton').next().html())[1]
        dlurl = urlori.protocol + '//' + urlori.hostname + '/d/' + key + '/' + (2 + 2 * 2 + parseInt(time)) + '3/DOWNLOAD'
    } catch (error) {
        time = _math.evaluate(/ \+ \((.*)\) \+ /gm.exec($('#dlbutton').next().html())[1])
        dlurl = urlori.protocol + '//' + urlori.hostname + '/d/' + key + '/' + (time) + '/DOWNLOAD'
    }
    return { error: false, url: dlurl }
}

exports.DLFunc = async (u, cb = () => { }) => {
    const url = await exports.GetLink(u)
    if (url.error) {
        console.log(_colors.bgRed(_colors.white(' ' + url.message + ' ')))
        return null
    }
    const req = await _https.get(url.url)
    console.log('🎁  ' + _colors.yellow('Start Download From URL : ' + url.url))
    console.log('⏳  ' + _colors.yellow('Waiting Server Response...'));
    await req.on('response', res => {
        if (!res.headers['content-disposition']) {
            console.log('🔁  ' + _colors.blue('Server Download Error, Try To Get New Link...'))
            exports.DLFunc(u, cb)
        } else {
            console.log('✅  ' + _colors.green('Server Response'))
            const size = parseInt(res.headers['content-length'], 10),
                filename = decodeURIComponent(res.headers['content-disposition'].match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/)[1])
            let currentSize = 0
            console.log('☕  ' + _colors.yellow('Start Downloading File : ' + filename))
            const file = _fs.createWriteStream(filename)
            res.pipe(file)
            const loadbar = new _proggers.Bar({
                format: 'Downloading ' + _colors.green('{bar}') + ' {percentage}% | {current}/{size} | ETA: {eta}s | Speed: {speed}',
                barsize: 25
            }, _proggers.Presets.shades_classic)
            loadbar.start(size, 0, {
                size: prettyNumber(size, 3),
                current: prettyNumber(currentSize, 3),
                speed: 0
            })
            res.on('data', c => {
                currentSize += c.length;
                loadbar.increment(c.length, {
                    speed: prettyNumber(c.length),
                    current: prettyNumber(currentSize, 3)
                })
            })
            res.on('end', _ => {
                loadbar.stop()
                file.close()
                console.log('✅  ' + _colors.green('Success Download File : ' + filename))
                cb()
            })
            res.on('error', _ => {
                loadbar.stop()
                console.log('❎  ' + _colors.green('Error Download File : ' + filename))
                cb()
            })
        }
    })
}

_commander.option('-d, --download <URL>', 'Download From URL, Can Be Multiple URL With Comma "https://zippy...,https://zippy"', a => {
    a = a.split(',')
    if (a.length > 1) {
        _async.eachSeries(a, (a, b) => { exports.DLFunc(a.trim(), b) }, (err, res) => { console.log(`Batch Download Done`) })
    } else {
        exports.DLFunc(a[0], () => { })
    }
})
_commander.option('-l, --link <URL>', 'Only Get URL Download File, For Now Only Support Single URL', async a => {
    const res = await exports.GetLink(a)
    if (res.error) {
        console.log(_colors.bgRed(_colors.white(' ' + res.message + ' ')))
        return null
    } else {
        console.log('🔥  ' + _colors.green('URL Download : ') + _colors.yellow(res.url))
    }
})
_commander.option('-b, --batch <FILE>', 'Get URL Download From File', (a) => {
    if (!_fs.existsSync(a)) {
        console.log(_colors.bgRed.white(`  File ${a} Not Found  `));
    } else {
        let file = _fs.readFileSync(a, 'utf8')
        file = file.split(/\r\n|\r|\n/)
        _async.eachSeries(file, (a, b) => { exports.DLFunc(a.trim(), b) }, (err, res) => { console.log(`Batch Download Done`) })
    }
})
_commander.version(`🔨  Version: ${_version}`, '-v, --version').usage('[options] <args>').name('zdl')
_commander.parse(process.argv)
if (!process.argv.slice(2).length) {
    _commander.outputHelp()
    return
}
