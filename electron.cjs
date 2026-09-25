const {app,BrowserWindow,session,dialog}=require('electron');
const path=require('path');
let win,server;
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{if(win){win.show();win.focus();}});
app.whenReady().then(async()=>{try{
 const {startServer}=await import('./server.mjs');
 const dataDir=path.join(app.getPath('desktop'),'Luma Keys','Library');
 const engine=app.isPackaged?path.join(process.resourcesPath,'Audiveris.app/Contents/MacOS/Audiveris'):path.join(__dirname,'engines/Audiveris.app/Contents/MacOS/Audiveris');
 const tessdata=app.isPackaged?path.join(process.resourcesPath,'tessdata'):path.join(__dirname,'engines/tessdata');
 const result=await startServer({port:0,dataDir,engine,tessdata});server=result.server;
 const origin='http://127.0.0.1:'+result.port;
 session.defaultSession.setPermissionRequestHandler((wc,permission,cb)=>cb(wc.getURL().startsWith(origin+'/')&&permission==='midi'));
 session.defaultSession.setPermissionCheckHandler((wc,p,requestOrigin)=>requestOrigin===origin&&p==='midi');
 win=new BrowserWindow({width:1480,height:980,minWidth:1050,minHeight:720,title:'Luma Keys',backgroundColor:'#101316',titleBarStyle:'hiddenInset',trafficLightPosition:{x:18,y:16},webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith(origin+'/'))e.preventDefault();});
 await win.loadURL(origin);win.on('closed',()=>{win=null;});
 }catch(e){dialog.showErrorBox('Luma Keys could not open',e.stack||e.message);app.quit();}
});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>server?.close());}
