const test = require('node:test')
const assert = require('node:assert/strict')
const { MongoClient, ObjectId } = require('mongodb')
const bcrypt = require('bcryptjs')
const { encode } = require('next-auth/jwt')
const base = process.env.PASSWORD_TEST_BASE_URL
const secret = process.env.NEXTAUTH_SECRET

test('реальный HTTP и MongoDB: первый пароль, гонка, смена, вход и отзыв Android-сессий', { skip: !base, timeout: 90000 }, async () => {
 assert.equal(new URL(base).hostname, '127.0.0.1')
 const client = new MongoClient('mongodb://127.0.0.1:27029')
 await client.connect()
 const db = client.db('vedelo_password_test'), users = db.collection('users')
 const own = new ObjectId(), foreign = new ObjectId(), mobileId = new ObjectId()
 const initialPassword='test-initial-123', firstPassword='test-first-123', nextPassword='test-next-123'
 await users.insertMany([
  {_id:own,tenantId:own,phone:'79990009101',password:'',registrationType:'vk',role:'user',archive:false},
  {_id:foreign,tenantId:foreign,phone:'79990009102',password:'',registrationType:'vk',role:'user',archive:false},
  {_id:mobileId,tenantId:mobileId,phone:'79990009103',password:await bcrypt.hash(initialPassword,10),registrationType:'vk',role:'user',archive:false},
 ])
 const token=await encode({secret,token:{userId:String(own),tenantId:String(own),phone:'79990009101',role:'user'}})
 const cookie=`next-auth.session-token=${token}`
 const request=(url,body,headers={})=>fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const web=(body)=>request('/api/auth/change-password',body,{cookie})
 try {
  assert.equal((await request('/api/auth/change-password')).status,401)
  assert.equal((await request('/api/mobile/v1/auth/change-password')).status,401)
  const status=await web();assert.equal(status.status,200);assert.equal(status.headers.get('cache-control'),'no-store')
  assert.deepEqual(await status.json(),{success:true,hasPassword:false})
  const concurrent=await Promise.all([web({newPassword:firstPassword,userId:String(foreign),tenantId:String(foreign)}),web({newPassword:firstPassword})])
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409])
  const stored=await users.findOne({_id:own});assert.equal(await bcrypt.compare(firstPassword,stored.password),true)
  assert.equal((await users.findOne({_id:foreign})).password,'')
  assert.equal((await web({newPassword:nextPassword})).status,400)
  assert.equal((await web({currentPassword:'wrong',newPassword:nextPassword})).status,400)
  assert.equal((await web({currentPassword:firstPassword,newPassword:nextPassword})).status,200)
  assert.equal(await bcrypt.compare(nextPassword,(await users.findOne({_id:own})).password),true)
  const webLogin=await request('/api/mobile/v1/auth/login',{phone:'79990009101',password:nextPassword,deviceId:'web-check'})
  assert.equal(webLogin.status,200)
  const mobileLogin=await request('/api/mobile/v1/auth/login',{phone:'79990009103',password:initialPassword,deviceId:'phone-check'})
  assert.equal(mobileLogin.status,200)
  let session=(await mobileLogin.json()).data
  const otherLogin=await request('/api/mobile/v1/auth/login',{phone:'79990009103',password:initialPassword,deviceId:'other-phone-check'})
  assert.equal(otherLogin.status,200);const otherSession=(await otherLogin.json()).data
  // Создаём только в изолированной БД состояние уже авторизованного VK-аккаунта без пароля.
  await users.updateOne({_id:mobileId},{$set:{password:''}})
  const mobile=(body)=>request('/api/mobile/v1/auth/change-password',body,{authorization:`Bearer ${session.accessToken}`})
  const mobileStatus=await mobile();assert.equal(mobileStatus.status,200);assert.deepEqual(await mobileStatus.json(),{success:true,data:{hasPassword:false}})
  const installed=await mobile({newPassword:firstPassword});assert.equal(installed.status,200)
  const installedBody=await installed.json();session=installedBody.data
  assert.equal('password' in session.user,false)
  assert.equal((await request('/api/mobile/v1/auth/me',undefined,{authorization:`Bearer ${otherSession.accessToken}`})).status,401)
  assert.equal((await mobile({newPassword:nextPassword})).status,400)
  const wrong=await mobile({currentPassword:'wrong',newPassword:nextPassword});assert.equal(wrong.status,400)
  assert.equal((await wrong.json()).error.message,'Текущий пароль указан неверно')
  const changed=await mobile({currentPassword:firstPassword,newPassword:nextPassword});assert.equal(changed.status,200)
  assert.equal((await request('/api/mobile/v1/auth/login',{phone:'79990009103',password:firstPassword})).status,401)
  assert.equal((await request('/api/mobile/v1/auth/login',{phone:'79990009103',password:nextPassword})).status,200)
  assert.equal(await bcrypt.compare(nextPassword,(await users.findOne({_id:mobileId})).password),true)
 } finally {
  await users.deleteMany({_id:{$in:[own,foreign,mobileId]}})
  await db.collection('mobilesessions').deleteMany({userId:{$in:[own,foreign,mobileId]}})
  await client.close()
 }
})
