from pathlib import Path
import subprocess, concurrent.futures
root=Path(__file__).resolve().parent.parent/'public'/'samples'
names=['A0','C1','Ds1','Fs1','A1','C2','Ds2','Fs2','A2','C3','Ds3','Fs3','A3','C4','Ds4','Fs4','A4','C5','Ds5','Fs5','A5','C6','Ds6','Fs6','A6','C7','Ds7','Fs7','A7','C8']
def get(n):
 p=root/(n+'.mp3')
 if not p.exists(): subprocess.run(['curl','-fsSL','--retry','2','https://tonejs.github.io/audio/salamander/'+n+'.mp3','-o',str(p)],check=True)
 return n
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex: print('Downloaded',len(list(ex.map(get,names))),'piano samples')
