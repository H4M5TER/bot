interface Config {
    delay: number
}

interface User {
    user_id: number,
    room_id: number,
    nickname: string,
    push_groups: string[],
    ban_groups: string[],
    // Koishi 要求频道名为字符串
}

export { Config, User }
