import { App } from 'koishi'
import 'koishi-adapter-onebot'
import { Config, User } from './config.d'

const app = new App({
    type: 'onebot:ws',
    server: 'http://localhost:6700',
    selfId: '123456789'
})
let users: User[] = [{
    user_id: 123456789,
    room_id: 123456,
    nickname: '',
    push_groups: [],
    ban_groups: []
}]
let config: Config = {
    delay: 30 * 1000
}

export { app, users, config }
