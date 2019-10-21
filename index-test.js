
require('dotenv').config();

var fs = require('fs');
var gm = require('gm');
var tesseract = require('node-tesseract');
var assert = require('assert');
var snoowrap = require('snoowrap');
var request = require('request-promise');
var Promise = require('bluebird');

const CROP_WIDTH_DENOMINATOR = 2;
const CROP_HEIGHT = 80;

require('console-stamp')(console, '[yyyy-mm-dd HH:MM:ss.l]');

var MIN_CHARGE = 30;

reddit = new snoowrap({
    user_agent: process.env.USER_AGENT,
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    username: process.env.USERNAME,
    password: process.env.PASSWORD
});

console.log('args',process.argv);

if (process.argv[2] == 'localtest') {
    fs.readdir('./testimages',function(err,files) {
        files.forEach((v,i) => {
            console.log('test'+i+' => '+v);
            go({id:'test'+i},'./testimages/',v)
            .then((str) => { console.log('test'+i+' => '+str);})
            .catch((str) => { console.error('test'+i+' => '+str);})
        });
    });
} else if (process.argv[2]) {
    console.log(process.argv[2]);
    var posts;
    if (process.argv[3] === 'new') {
        posts = newposts(process.argv[2]);
    } else {
        posts = hotposts(process.argv[2]);
    }

    posts.map(post => {
        //console.log('checking post',post.title,post.permalink);
        //console.log(post);
        var match = post.url.match(/i.reddituploads.com|(png|jpg|gif)(\?|$)/);
        if (match !== null) {
            fs.stat('./images/'+post.id+'.png',function(err,stats) {
                if (stats === undefined) {
                    console.log('downloading for post',post.id, post.permalink);
                    download(post,match[1])
                    .then((res) => {
                        console.log('download then',res);
                    })
                    .catch((res) => {
                        console.log('download catch',res);
                    })
                    .finally(() => {
                        console.log('finally',post.id);
                        fs.writeFile('./images/'+post.id+'.png',"",(err) => {
                            console.log('finally zero images',post.id,err);
                        });
                        fs.writeFile('./tmp/'+post.id+'.png',"",(err) => {
                            console.log('finally zero tmp',post.id,err);
                        });
                    });
                }
            });
        }
    });
} else {
    console.log('subreddit parameter required');
    process.exit(1);
}

function newposts(sub) {
    return reddit.get_subreddit(sub).get_new({limit: 100});
}
function hotposts(sub) {
    return reddit.get_subreddit(sub).get_hot({limit: 100});
}

function download(post,ext) {
    return new Promise((resolve,reject) => {
        var id = post.id;
        var url = post.url;
        ext='png';
        console.log('dl',id,url);
        return request({
            uri: url,
            encoding: null
        })
        .then(function(d) {
            fs.writeFile('./images/'+id+'.'+ext,d,function(err) {
                if (err !== undefined) {
                    console.log('going',id);
                    return go(post,'./images/',id+'.'+ext)
                    .then((go_result) => {
                        return resolve(go_result);
                    })
                    .catch((err) => {
                        reject(err);
                    })
                    .finally(() => { 
                        console.log('finally gone'); 
                    });
                }
            });
        });
    });
}

function go(post,d,f) {
    return new Promise((resolve,reject) => {
        var id = post.id;
        try {
        var img = gm(d+f);
        img.size(function(err,dims) {
            if (err) {
                console.log('image failed',d,f,err);
                reject('image failed',d,f,err);
                return;
            }
            
            var tmp = './tmp/'+f;

            if (dims.height < dims.width) {
                reject('wrong dimensions ',dims);
            } else {
                console.log('dims',f,dims);
            }

            img.crop(dims.width/CROP_WIDTH_DENOMINATOR,CROP_HEIGHT,dims.width*(CROP_WIDTH_DENOMINATOR-1)/CROP_WIDTH_DENOMINATOR,0)
            .write(tmp,function(err) {
                if (err !== undefined) {
                    console.log('write error',err);
                    reject('write error',err);
                } else {
                    process_image(post,f,tmp)
                    .then(resolve)
                    .catch(reject);
                }
            });
        });
        } catch(e) {
            reject(e);
        }
    });
}

function process_image(post,n,f) {
    return new Promise((resolve,reject) => {
        var id = post.id;
        console.log('process post',post.id,post.permalink);
        tesseract.process(f,{psm: 7},function(err,text) {
            if (err) {
                console.log(id,'failed tesseract');
                return;
            }

            console.log(n,'raw',text);

            var pct = text.match(/(\d+)%/);
            if (pct && pct[1] > 0) {
                if (pct[1] <= MIN_CHARGE) {
                    console.log(id,'phone is at '+pct[1]+'%');
                    
                    if (process.argv[3] === 'nopost') {
                        resolve();
                    }

                    reddit.get_submission(id)
                    //.reply("test\n\n^^test ^^comment")
                    .reply("this phone's battery is at "+pct[1]+"% and needs charging!\n\n---\n\n" +
                           " ^^I ^^am ^^a ^^bot. ^^I ^^use ^^OCR ^^to ^^detect ^^battery ^^levels. " +
                           "^^Sometimes ^^I ^^make ^^mistakes. ^^sorry. [^^info](https://np.reddit.com/r/phonebatterylevelbot)")
                    .then(function(arg) {
                        console.log('new comment',id,pct[1]+'%',post.permalink+arg.id+'/');
                        fs.writeFile(f,"",(err) => {
                            console.log('zeroing file',f,err);
                        });
                        resolve();
                    })
                    .catch(function(err) {
                        if (err.message.indexOf('RATELIMIT') > -1) {
                            console.log(id,'ratelimited ',err.message);
                            fs.unlink('./images/'+id+'.png');
                        } else {
                            console.error(err);
                        }
                        reject();
                    });
                } else {
                    console.log(id,'phone is at '+pct[1]+'% and is A-OK, not posting.');
                    resolve();
                }
            } else {
                reject('failed to find battery level');
            }
        });    
    });
}
