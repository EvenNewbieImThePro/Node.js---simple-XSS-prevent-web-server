const http = require('http');
const fs = require('fs');
const qs = require('querystring'); /* 쿼리스트링으로 인코딩 되어 있는 애들을 파싱 
                                    qs.parse("mykey=myvalue&mykey2=myvalue2") 결과: { mykey: "myvalue", mykey2: "myvalue2"}
                                    */
const xss = require('xss');
const Sequelize = require('sequelize');

const sequelize = new Sequelize ('db', 'id', 'password',
    {host: 'ip',
    dialect: 'db',
    });

    const Content = sequelize.define('content1', {
        title: Sequelize.DataTypes.STRING,
        content: Sequelize.DataTypes.TEXT('long'),
    }); // STRING 은 255자 까지, TEXT 타입은 1MB 이상 long=10MB이상

sequelize.sync();

function fetchBody(req){
    return new Promise((resolve, reject) => {
        let text = '';
        req.on('data', (data) => {
            text = text + data
        });
        req.on('end', () => {
            resolve(qs.parse(text));
        }); // mykey=myvalue&mykey2=myvalue2... qs를 파싱
    }); 
}

var options = {
    whiteList: {
      a: ["href", "title", "target"],
      b: ["b", "br"]
    }
  };

const route = {
    "/" : () => {
        return new Promise((resolve, reject) => { //fs는 엄청 오래된 모듈이기 때문에 as 사용 불가능, Promise 를 Return 해줘야 함
            fs.readFile('./index.html', (err, data) => {
                if (err) {
                    return reject(err);
                }
                resolve(data);
            });
        });
    }, "/api/contents": async (req) => { // async는 자동으로 Promise 를 Return
        if (req.method === "GET"){
            return JSON.stringify(await Content.findAll());
        } else {
            const data = await fetchBody(req);
            if (!data.title || !data.content) {
                return null;
            }
            let title = xss(data.title);
            let content = xss(data.content);           
            return JSON.stringify(await Content.create({
                title: title,
                content: content,
            }));
        }
    }
}; 

http.createServer(async(req, res) => {
    if (req.url.indexOf('/viewer/') !== -1) {
        const contentId = req.url.split('/')[2];
        const content = await Content.findByPk(contentId);
        fs.readFile('viewer.html', (err, data) => {
            if (err) {
                res.writeHead(404);
                return res.end("Not found or System Error");
            }
            let contentHTML = data.toString().replace('${content}', content.content).replace('${title}', content.title);
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf8',
            });
            res.end(contentHTML);
        });
        return;
    }
    const selectedRouteHandler = route[req.url];
    if(!selectedRouteHandler) {
        res.writeHead(404);
        return res.end("Not Found.");
    }
    let responseString;
    try{
        responseString = await selectedRouteHandler(req);
    } catch(err) {
        res.writeHead(404);
        return res.end("Page not found or System error."); // API를 가져올때는 스트링, HTML을 가져올때는 Object 
    }
    if (responseString === null) { // Null 이면 파라미터가 제대로 보내지지 않았거나 잘못 보낸 것 
        res.writeHead(400);
        return res.end("Some parameters miss sented.");
    }
    if (typeof responseString === 'object'){ // 스트링과 넘버를 제외하면 전부 Object
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
        }); 
        res.end(responseString);
    } else {
        res.writeHead(200, {
            'Content-Type': 'text/json; charset=utf-8',
        });
        res.end(responseString); // res.wrtie or end 할 때 Buffer or String 이 들어갈 수 있다. 
    }
}).listen(8080);