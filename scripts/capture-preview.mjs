import {_electron as electron} from '@playwright/test';
const app=await electron.launch({executablePath:'/Users/prince/Desktop/Luma Keys.app/Contents/MacOS/Luma Keys',args:[]});
try{const p=await app.firstWindow();await p.getByRole('heading',{name:'Twinkle, Little Star',exact:true}).waitFor();await p.waitForTimeout(400);await p.screenshot({path:'evidence/Luma Keys - preview.png',fullPage:true});}finally{await app.close();}
