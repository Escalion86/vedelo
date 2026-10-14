// Проверки UX по сохранённому DOM настоящего RN Web стенда.
// Запускать только внутри общей очереди flock.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process')
const scratch='/home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011'
const output=path.join(scratch,'browser-artifacts'),gates=path.join(output,'gates')
const vendor='/home/aleksei/projects/ux-ui-agent-skills/scripts'
const playwright=path.join(scratch,'browser-deps/node_modules/playwright')
async function run(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:gates,env:{...process.env,DS_REQUIRE_BROWSER:'1'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);child.on('error',reject);child.on('close',code=>resolve({code,output}))})}
async function main(){
 let executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
 if(!executable)for(const dir of (await fs.readdir('/home/aleksei/.cache/ms-playwright')).sort().reverse()){for(const platform of ['chrome-linux-arm64','chrome-linux','chrome-linux64']){const file=path.join('/home/aleksei/.cache/ms-playwright',dir,platform,'chrome');try{await fs.access(file);executable=file;break}catch{}}if(executable)break}
 if(!executable)throw Error('Chromium не найден')
 const wrapper=path.join(gates,'node_modules/playwright');await fs.mkdir(wrapper,{recursive:true})
 await fs.writeFile(path.join(wrapper,'package.json'),JSON.stringify({name:'playwright',main:'index.cjs'}))
 await fs.writeFile(path.join(wrapper,'index.cjs'),`const real=require(${JSON.stringify(playwright)});exports.chromium=new Proxy(real.chromium,{get(target,key){if(key==='launch')return opts=>{const {channel,...rest}=opts||{};return target.launch({...rest,executablePath:${JSON.stringify(executable)},args:['--no-sandbox']})};const value=target[key];return typeof value==='function'?value.bind(target):value}});`)
 const files=(await fs.readdir(output)).filter(f=>f.endsWith('.html'));if(!files.length)throw Error('Нет снимков настоящих компонентов')
 const results=[],snapshots=[]
 for(const width of [360,390,420]){const group=path.join(gates,`width-${width}`);await fs.mkdir(group,{recursive:true});for(const file of files.filter(f=>f.startsWith(width+'-'))){let source=path.join(scratch,file.includes('-billing')?'browser-billing-final':'browser-settings-period-final',file);try{await fs.access(source)}catch{source=path.join(output,file)}const raw=await fs.readFile(source,'utf8');const exported=/<meta[^>]+charset=/i.test(raw)?raw:raw.replace('<head>','<head><meta charset="utf-8">');await fs.writeFile(path.join(group,file),exported);snapshots.push({file,source,sha256:crypto.createHash('sha256').update(raw).digest('hex'),exportSha256:crypto.createHash('sha256').update(exported).digest('hex'),utf8MetadataAdded:exported!==raw})}await fs.writeFile(path.join(gates,'snapshot-sources.json'),JSON.stringify(snapshots,null,2))}
 for(const name of (process.env.D_GATE_OVERFLOW_ONLY==='1'?['verify_overflow']:['verify_target_size','verify_responsive','verify_overflow'])){
  const source=await fs.readFile(path.join(vendor,name+'.mjs'));await fs.writeFile(path.join(gates,name+'.mjs'),source)
  for(const width of [360,390,420]){const args=[path.join(gates,name+'.mjs'),path.join(gates,`width-${width}`),`--widths=${width}`];const result=await run(args);await fs.writeFile(path.join(gates,`${name}-${width}.log`),result.output);results.push({name,width,source:path.join(vendor,name+'.mjs'),sha256:crypto.createHash('sha256').update(source).digest('hex'),command:[process.execPath,...args],exitCode:result.code});await fs.writeFile(path.join(gates,'results.json'),JSON.stringify(results,null,2));console.log(`${name} ${width}: exit ${result.code}`)}
 }
 process.exitCode=results.some(r=>r.exitCode!==0)?1:0
}
main().catch(e=>{console.error(e);process.exitCode=1})
