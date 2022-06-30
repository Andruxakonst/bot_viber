const http = require('http');
const https = require('https');
const fs = require('fs');
const request = require('request');
//файл конфигурации 
const config = require('./config.json');

const hostname = config.hostname;
const port = config.port;

let service = {
  usersArr:[],    //массив хранения телефонов и base64 строк
  servicesArr:[], //массив хранения сервисов

  postStart(){
    reg(); //запускаем функцию что бы сразу получить данные при первом запуске
    function reg(){
      service.servicesArr = [];
      request({'method': 'POST','url': config.servicesURL,'headers': {},'form': {}}, function (error, response) {
        if (error) {
          console.log(error); 
          log(`Error get services . Error - ${error}`);
          response.body = `Error get services. Error - ${error}`;
        };
        let data = JSON.parse(response.body);
        //console.log(data.status);
        if(data && 'status' in data && data.status == 'ok'){
          data.data.forEach(element => service.servicesArr.push(element));
        }else{
          log(`error data in get services response - data - ${response.body}`);
        };
      });

      request({'method': 'POST','url': config.servicesURL,'headers': {},'form': {service_type: "delivery"}}, function (error, response) {
        if (error) {
          console.log(error); 
          log(`Error get services delivery. Error - ${error}`);
          response.body = `Error get services delivery. Error - ${error}`;
        };
        let data = JSON.parse(response.body);
        //console.log(data.status);
        if(data && 'status' in data && data.status == 'ok'){
          data.data.forEach(element => service.servicesArr.push(element));
        }else{
          log(`error data in get delivery response - data - ${response.body}`);
        };
      });
    };

    setInterval(reg,config.servicesGetInterval);

  },//save services to array _services every 5 minutes

  getIpPort(id){

    if(service.servicesArr.length>0 && id){
      let finded = service.servicesArr.find((el)=>{return el.firm_id == id});

      if(finded){
        return {"ip":finded.ip, "port":finded.port};
      }else{
        log(`не удалось нати фирму с id - ${id}`);
        return {"ip":'', "port":''};
      };
      
    }else{
      log(`Не удалось получить список фирм или значение id неизвестно. Количество фирм в массиве - ${service.servicesArr.length} ID- ${id}`);
      return {"ip":'', "port":''};
    };
    
  }, 
  async getTokenUrl(user_id, phone){
    if(service.usersArr.length>=200){service.usersArr.pop()}; //ограничиваем объем массива до 200
    let findedUser = service.usersArr.find((el)=>{return el.user_id == user_id});//находим элемент с полученным user_id
    if(findedUser && `f` in findedUser.context && `s` in findedUser.context && `p` in findedUser.context){
      
      findedUser.phone = phone; //добавляем в объект номер телефона

      let context = findedUser.context;
      let firm_id = context.f;
      let service_id = context.s;
      let package_name = context.p;
      let serviceGet = service.getIpPort(firm_id); //получаем ip и port из для запроса токена
      let ipAdrr = serviceGet.ip;
      let port = serviceGet.port;
      let URLfullTokenGet = `http://${ipAdrr}:${port}`+config.getTokenURL;
      

      //Проверяем, все ли необходимые даные есть для запроса токена
     
      if(!ipAdrr =='' && !port =='' && !phone =='' && !firm_id =='' && !service_id =='' && !package_name ==''){

        let getidToken = new Promise((resolve, reject) => {

          //запрос на получение токена
          let options = {
            'method': 'POST',
            'url': URLfullTokenGet,
            'headers': {},
            formData: {
              'login': phone,
              'id_firm': firm_id,
              'service': service_id,
              'package_name': package_name,
              'bot_name': 'viber',
              'sign': config.getTokenSign,
            }
          };
          log(`User data for get token ${JSON.stringify(options.formData)}`);
          request(options, function (error, response) {
            if (error) throw new Error(error);
            let data = JSON.parse(response.body);

            if(data &&'status' in data && data.status == 'ok'){
            
              //заменить на полученный
              let token = data.data;
              //кодируем инфу в base64
              let token_phone = {"token":token, "phone":'+'+phone};
              let buf = Buffer.from(JSON.stringify(token_phone));
              let url = `${config.redirectURL}?data=${buf.toString('base64')}`;   
              log(`Token for user ${JSON.stringify(findedUser)} successfully received`);
              resolve(url);
            }else{
              log(`error getting token  ${JSON.stringify(options.formData)} for user - ${JSON.stringify(findedUser)} URL - ${URLfullTokenGet} req - ${JSON.stringify(data)}`);
              console.log(`req else`,data);
              resolve(`Ошибка! Что-то пошло не так. Пожалуйста, попробуйте еще раз. Если ошибка повторится, обратитесь в техническую поддержку. Приносим извинения за доставленные неудобства.`);
            };

          });

        });

        return await getidToken;

      }else{
        log(`get token error Не хватает элементов для запроса URLfullTokenGet ${URLfullTokenGet}  phone ${phone} firm_id ${firm_id} service_id ${service_id} package_name ${package_name}`);
        return `Ошибка! Что-то пошло не так. Пожалуйста, попробуйте еще раз. Если ошибка повторится, обратитесь в техническую поддержку. Приносим извинения за доставленные неудобства.`;
        
      };
      

    }else{
      log(`Don't fined element in ${user_id} service.usersArr findedUser - ${findedUser}`);
      log(`service.usersArr -  ${JSON.stringify(service.usersArr)} user_id - ${user_id} findedUser ${findedUser}`);
      return 'Ошибка! Не удалось найти Ваш id в массиве даных. Если ошибка повторяется, обратитесь в службу технической поддержки!';
    };
    
  }
};

//запуск!!!!

inServer();
setWebHook();
service.postStart();

function setWebHook(){
  //console.log(`Runing webhook`);
  let data = JSON.stringify(
    {
      "url": config.inputUrl+'/', 
      "event_types":[
          "delivered",
          "seen",
          "failed",
          "subscribed",
          "unsubscribed",
          "conversation_started"
      ],
      "send_name": true,
      "send_photo": true
    }
  );
  log(`Отправлены данные для получения токена - ${data}`);

  const options = {
    hostname: config.botUrlApi,
    port: 443,
    path: `/pa/set_webhook`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Viber-Auth-Token': config.botToken,
    }
  };

  const   req = https.request(options, res => {
    //console.log(`statusCode: ${res.statusCode}`);

    res.on('data', d => {
      //process.stdout.write(d);
      
      //если вэбхук ОК, запускаем сервер
      
      if(res.statusCode == 200){
        d=JSON.parse(d);
        if("status" in d && d.status == 0){
          log(`return viber for run webhook - ${res.statusCode} data - ${JSON.stringify(d)}`);
          console.log(`Webhook started`)
        }else{
          log(`return viber - ${res.statusCode} data - ${JSON.stringify(d)}`);
          //console.log(`Run webhook error status - ${d.status} msg - ${d}`);
        };
      };

    });

  });

  req.on('error', error => {
    log(`sendMessage error - ${error}`);
    console.error('error',error)
  });

  req.write(data);
  req.end();
};

//сервер для получения данных
function inServer(){
  
  const server = http.createServer((req, res) => {
    //console.log(`URL`, req.url);
      //отлов запроса на картинку
      if(req.url.includes('/img/')){
        //console.log(`URL`, req.url);
        fs.readFile('.'+req.url, function (error, data) {
          if (error) {
            res.statusCode = 404;
            res.end('Resourse not found!');
          } else {
            res.end(data);
          }
        });
      
      };

      req.on('data', (data) => {
        
        data = JSON.parse(data);
        res.statusCode = 200; //отвечаем ОК
        //console.log(data);
        //отвечаем приветственным собщением

        if(data.event&&data.event=="conversation_started"){ 
          res.end(JSON.stringify(
            {
              "min_api_version":3,
              "sender":{
                 "name":"Бот авторизации upTaxi",
              },
              "tracking_data":"tracking data",
              "type":"text",
              "text":`Для регистрации нам необходим Ваш номер телефона! Пожалуйста, отправте его нажав кнопку "Отправить мой номер" ниже.`,
              "keyboard":{
                "Type":"keyboard",
                "DefaultHeight":false,
                "Buttons":[
                   {
                      "ActionType":"share-phone",
                      "ActionBody":"reply",
                      "Text":'Отправить мой номер',
                      "TextSize":"regular",
                      "Silent":true,
                   }
                ]
             },
           }
          ));

        }else{ //если не первый вход отвечаем ОК и закрываем соединение 
          res.end('OK'); 
        };

        //отправляем принятое обновление 
        messHendler(data);

      });

    //если пришла ошибка
    req.on('error', (err) => {
      console.log(`Ошибка: ${err}`)
    });

    //если соединение разорвано
    req.on('end', () => {
      //console.log(`Соединение закрыто`);
    });

  });

  server.listen(port, hostname, () => {
    console.log(`Incoming server run`);
  });

};

function messHendler(data){
  
  if(data.event == 'conversation_started'&&data.context){
    str = Buffer.from(data.context,'base64').toString(); //декодируем полученную строку после /start;
    let context = JSON.parse(str);

      //сохраняем объект пользователя и строку в массив сервис-user
      service.usersArr.find((el)=>{
        if(el.user_id == data.user.id){el = {}}
      });//находим элемент с полученным user_id
      service.usersArr.unshift({"user_id":data.user.id, "context":context});
      log(`user pushed- ${JSON.stringify(data.user)} string to Base64 ${JSON.stringify(str)} OK`);
  };

  //console.log(data);
  let mess = { //пустой объект для отправки сообщения
    "receiver":"",
    "min_api_version":3,
    "sender":{
       "name":"Бот авторизации upTaxi",
    },
    "tracking_data":"tracking data",
    "type":"text",
 };
 let photo = { //пустой объект для отправки изображений
  "receiver":"",
  "min_api_version":3,
  "sender":{
     "name":"Бот авторизации upTaxi",
  },
  "tracking_data":"tracking data",
  "type":"picture",
};
  
  if(data.event == 'message'){
    switch(data.message.type){
      case 'text':
        //обрабатываем текст
        //добавляем клавиатуру для отправки телефона
        mess.keyboard = photo.keyboard = {
          "Type":"keyboard",
          "DefaultHeight":false,
          "Buttons":[
             {
                "ActionType":"share-phone",
                "ActionBody":"reply",
                "Text":'Отправить мой номер',
                "TextSize":"regular",
                "Silent":true,
             }
          ]
        };
        log(`text swith: sender - ${JSON.stringify(data.sender)} text - ${data.message.text}`);
        //console.log(`message - ${data.message.text}`);
        mess.receiver = data.sender.id;
        if(data.message.text.indexOf('/start') == 0 && data.message.text.split(' ')[1]){
          let strAfterStart = data.message.text.split(' ')[1];
          //добавляем клавиатуру для запроса номера телефона
         
          photo.receiver = data.sender.id;
          photo.text = "Нажмите эту кнопку что бы отправить номера телефона.";
          photo.media =  config.inputUrl+`/img/viber.jpg`;
          photo.thumbnail = config.inputUrl+`/img/viber_l.jpg`;
          //photo.media = `${config.inputUrl}/img/viber.jpg`;
          mesSend(photo);
          mess.text = 'Я не знаю что вы этим хотите сделать... Я умею только регистрировать.';
          //mesSend(mess);
        }else{
          photo.receiver = data.sender.id;
          photo.text = "Нажмите эту кнопку что бы отправить номера телефона.";
          photo.media = config.inputUrl+`/img/viber.jpg`;
          photo.thumbnail = config.inputUrl+`/img/viber_l.jpg`;
          //photo.media = `${config.inputUrl}/img/viber.jpg`;
          mesSend(photo);
          mess.text = 'Я не знаю что вы этим хотите сделать... Я умею только регистрировать. Для этого нужно перейти из приложения';
          //mesSend(mess);
        };
        
      break;
      case 'contact':
        //обрабатываем текст
        log(`contact swith: sender - ${JSON.stringify(data.sender)} text - ${data.message.text} contact - ${JSON.stringify(data.message.contact)}`);
        //console.log(`message - ${data.message.text}`);
        mess.receiver = data.sender.id;
        //mess.text = `Тут должен быть контекст - ${context}`;
        //delete mess.keyboard; //убираем клавиатуру

        //убрать контекст! Вместо него реализовать на сервис

          service.getTokenUrl(data.sender.id, data.message.contact.phone_number).then((str)=>{
            //console.log(str);
            log(`URL fo user ${JSON.stringify(data.sender)} sending in base64 data -  ${str}`);
            mess.text = `Спасибо, ${data.sender.name}! Мы получили Ваш номер телефона. Теперь перейдите по ссылке ниже:
${str}`;
            // если в ответе есть слово Ошибка то выводим это текст
            if(str.indexOf('Ошибка!') != -1){
              mess.text = str;
            };
            mesSend(mess);
          });

      break;
      // case 'location':
      //   //обрабатываем текст
      //   log(`location swith: sender - ${JSON.stringify(data.sender)} location - ${JSON.stringify(data.message.location)}`);
      //   //console.log(`message - ${data.message.text}`);
      // break;
      default:
        //неведомая штука
        //console.log(`Непонятно что такое - data`,data);
        log(`default swith: data - ${JSON.stringify(data)}`);
        mess.receiver = data.sender.id;
        mess.text = `Я создан только для регистрации пользователей! Если регистрация уже выполнена, просто удалите меня. Спасибо!`;

        mesSend(mess);

      break;
    };
  }else{
    //console.log(`Другой тип сообщения`, data);
    log(`no message: data - ${JSON.stringify(data)}`);
  };
};

function mesSend(mess){

  let data = JSON.stringify(mess);
  log(`Отправлен - ${data}`);

  const options = {
    hostname: config.botUrlApi,
    port: 443,
    path: '/pa/send_message',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Viber-Auth-Token': config.botToken,
    }
  };

  const req = https.request(options, res => {
    //console.log(`statusCode: ${res.statusCode}`);

    res.on('data', d => {
      //process.stdout.write(d);
      //console.log(d);
      log(`return viber - ${res.statusCode} data - ${d}`);
    });

  });

  req.on('error', error => {
    //log(`sendMessage status code - ${res.statusCode} error - ${error} text - ${mess.text}`);
    console.error('error',error)
  });

  req.write(data);
  req.end();
};


//записать в файл
function log(str){
  if(config.logInconsole){console.log(str)};
  if(config.logInFile){ //проверяем переменную для записи в конфиг файле
    let dateNow = new Date(Date.now());
    let dateNowStr = `${dateNow.getFullYear()}-${dateNow.getMonth()+1}-${dateNow.getDate()} ${dateNow.getHours()}:${dateNow.getMinutes()}:${dateNow.getSeconds()}`
    fs.appendFile(config.puthToLog+config.logFileName,`${dateNowStr} - ${str} \n`, err=>{
        if(err) {
            return false;
            throw err;
        }else{
            //console.log(str);
            return true;
        };  
    });
  };
};