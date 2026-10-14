// Пассивный экспорт живого DOM/CSSOM. Assertions остаются в исходных наборах.
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex')

function attachEvidence(browser, output, sourceHashes) {
  let sequence = 0
  const records = []
  async function capture(page, reason) {
    if (page.isClosed()) return
    await fs.mkdir(output, { recursive: true })
    const state = await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true)
      clone.querySelectorAll('script').forEach(el => el.remove())
      const styles = [...document.querySelectorAll('style')]
      clone.querySelectorAll('style').forEach((el, i) => {
        el.textContent = [...(styles[i].sheet?.cssRules || [])].map(rule => rule.cssText).join('\n')
      })
      if (!clone.querySelector('meta[charset]')) {
        const meta = document.createElement('meta'); meta.setAttribute('charset', 'utf-8'); clone.querySelector('head').prepend(meta)
      }
      const rect = el => { const r = el.getBoundingClientRect(); return { left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height } }
      const controls = [...document.querySelectorAll('button,[role=button],[role=link],input,select,textarea')].map(el => {
        const raw = rect(el), visible = { ...raw }, ancestors = []
        for (let p = el.parentElement; p; p = p.parentElement) {
          const c = getComputedStyle(p), r = rect(p)
          if (/hidden|clip|scroll|auto/.test(c.overflowX)) { visible.left=Math.max(visible.left,r.left); visible.right=Math.min(visible.right,r.right) }
          if (/hidden|clip|scroll|auto/.test(c.overflowY)) { visible.top=Math.max(visible.top,r.top); visible.bottom=Math.min(visible.bottom,r.bottom) }
          if (/hidden|clip|scroll|auto/.test(c.overflowX+' '+c.overflowY)) ancestors.push({testID:p.getAttribute('data-testid'),rect:r,overflowX:c.overflowX,overflowY:c.overflowY,scrollTop:p.scrollTop,scrollHeight:p.scrollHeight,clientHeight:p.clientHeight})
        }
        visible.left=Math.max(0,visible.left);visible.right=Math.min(innerWidth,visible.right);visible.top=Math.max(0,visible.top);visible.bottom=Math.min(innerHeight,visible.bottom)
        visible.width=Math.max(0,visible.right-visible.left);visible.height=Math.max(0,visible.bottom-visible.top)
        return {label:el.getAttribute('aria-label')||el.textContent,testID:el.getAttribute('data-testid'),raw,visible,ancestors}
      })
      return { html:'<!doctype html>'+clone.outerHTML, url:location.href, viewport:{width:innerWidth,height:innerHeight}, fixture:window.__fixture||null, surface:window.qa?.surface||new URLSearchParams(location.search).get('surface'), controls, documentWidth:document.documentElement.scrollWidth, cssRuleCount:styles.reduce((sum,el)=>sum+(el.sheet?.cssRules.length||0),0) }
    })
    const name = String(++sequence).padStart(4,'0')+'-'+reason
    const html=path.join(output,name+'.html'),png=path.join(output,name+'.png'),measurement=path.join(output,name+'.json')
    await fs.writeFile(html,state.html)
    await page.screenshot({path:png,fullPage:true})
    delete state.html
    await fs.writeFile(measurement,JSON.stringify({...state,reason,sourceHashes},null,2))
    records.push({name,html,png,measurement,htmlSha256:sha256(await fs.readFile(html)),pngSha256:sha256(await fs.readFile(png)),measurementSha256:sha256(await fs.readFile(measurement)),...state})
    await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({sourceHashes,records},null,2))
  }
  const newPage=browser.newPage.bind(browser)
  browser.newPage=async (...args)=>{
    const page=await newPage(...args),close=page.close.bind(page),go=page.goto.bind(page),shot=page.screenshot.bind(page),setContent=page.setContent.bind(page)
    let loaded=false,capturing=false
    const exportState=async reason=>{if(capturing||!loaded)return;capturing=true;try{await capture(page,reason)}finally{capturing=false}}
    page.goto=async (...params)=>{await exportState('before-navigation');loaded=true;return go(...params)}
    page.setContent=async (...params)=>{loaded=true;return setContent(...params)}
    const add=page.addScriptTag.bind(page)
    page.addScriptTag=async (...params)=>{const value=await add(...params);loaded=true;return value}
    page.screenshot=async (...params)=>{const value=await shot(...params);if(!capturing)await exportState('screenshot');return value}
    page.close=async (...params)=>{try{await exportState('close')}finally{await close(...params)}}
    return page
  }
  const close=browser.close.bind(browser)
  browser.close=async (...args)=>{
    try{for(const context of browser.contexts())for(const page of context.pages())await page.close()}
    finally{await close(...args)}
  }
}
module.exports={attachEvidence,sha256}
