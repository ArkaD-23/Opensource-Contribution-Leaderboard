const http = require('http')
const jsonfile = require('jsonfile')
const url = require('url')
const Util = require('./util/Util')
const API = require('./util/API')
const fs = require('fs')
const spawn = require('child_process').spawn
const express = require('express')
const app = express()
const proxy = require('http-proxy-middleware')
const path = require('path')

const configPath = './config.json'
const admindataPath = './admindata.json'
const dataPath = '../assets/data/data.json'
const logPath = '../assets/data/log.json'
const port = jsonfile.readFileSync(configPath).serverPort
const configBackupPath = '../../configBackup.json'
const proxyOption = {
    target: 'http://localhost:' + port + '/',
    pathRewrite: { '^/api': '' },
    changeOrigin: true,
}
const websocketProxyOption = {
    target: 'http://localhost:' + port + '/',
    changeOrigin: true,
}

Object.defineProperty(Array.prototype, 'flat', {
    value: function (depth = 1) {
        return this.reduce(function (flat, toFlatten) {
            return flat.concat(
                Array.isArray(toFlatten) && depth > 1
                    ? toFlatten.flat(depth - 1)
                    : toFlatten
            )
        }, [])
    },
})

if (process.env.NODE_ENV !== 'development') {
    app.use('/api', proxy(proxyOption))
    app.all('/server/*', (req, res, next) => {
        res.status(403).send({
            message: 'Access Forbidden',
        })
    })
    app.use('/socket.io', proxy(websocketProxyOption))
    app.use('/', express.static(path.resolve(__dirname, '..')))
    app.listen(8080)
}

if (!fs.existsSync(admindataPath)) {
    jsonfile.writeFileSync(admindataPath, [])
}

// spawn - `node refresh.js`
const refresh = spawn('node', ['refresh.js'], {
    shell: true,
    stdio: 'inherit',
})
process.on('exit', () => {
    refresh.kill() // kill it when exit
})

const server = http
    .createServer((req, res) => {
        const route = url.parse(req.url).pathname
        const { adminPassword } = jsonfile.readFileSync(configPath)

        switch (route) {
        case '/data':
            res.setHeader('Cache-Control', 'no-store')
            jsonfile.readFile(dataPath, (err, obj) => {
                if (err) console.log('[ERROR]' + err)
                res.end(JSON.stringify(obj))
            })
            break
        case '/log':
            res.setHeader('Cache-Control', 'no-store')
            jsonfile.readFile(logPath, (err, obj) => {
                if (err) console.log('[ERROR]' + err)
                res.end(JSON.stringify(obj))
            })
            break
        case '/config':
            var Config = jsonfile.readFileSync(configPath)
            res.end(
                JSON.stringify({
                    organization: Config.organization,
                    organizationHomepage: Config.organizationHomepage,
                    organizationGithubUrl: Config.organizationGithubUrl,
                })
            )
            break
        case '/login':
            if (req.method === 'GET') {
                res.end('Permission not found\n')
                return
            }

            var { delay, contributors, startDate } = jsonfile.readFileSync(
                configPath
            )
            var contributorsList = []

            Util.post(req, async (params) => {
                const { token } = params
                if (token === adminPassword) {
                    await Promise.all(
                        contributors.map(async (contributor) => {
                            const admindata = jsonfile.readFileSync('./admindata.json')
                            const existContributor = findContributor(
                                contributor,
                                admindata
                            )

                            if (existContributor !== null) {
                                contributorsList.push(existContributor)
                            } else {
                                const avatarUrl = await API.getContributorAvatar(contributor)
                                if (avatarUrl !== '') {
                                    contributorsList.push({
                                        username: contributor,
                                        avatarUrl: avatarUrl,
                                    })
                                }
                            }
                        })
                    )
                    res.end(
                        JSON.stringify({
                            code: 0,
                            delay,
                            contributors: contributorsList,
                            startDate,
                        })
                    ) // success
                    jsonfile.writeFileSync(admindataPath, contributorsList)
                } else {
                    res.end(
                        JSON.stringify({
                            code: 1,
                            delay: 0,
                            contributors: {},
                            startDate: '',
                        })
                    ) // wrong
                }
            })
            break
        case '/getRepositories':
            if (req.method !== 'GET') {
                res.end('Permission not found\n')
                return
            }
            var { organization, includedRepositories } = jsonfile.readFileSync(
                configPath
            )
            API.getRepositories(organization).then((repositories) => {
                if (repositories !== '') {
                    res.end(
                        JSON.stringify({
                            repositories: repositories.flat(),
                            includedRepositories: includedRepositories,
                        })
                    )
                } else {
                    res.end()
                }
            })
            break
        case '/setIncludedRepositories':
            if (req.method !== 'POST') {
                res.end('Permission denied\n')
                return
            }

            Util.post(req, (params) => {
                const { token, includedRepositories } = params

                if (token !== adminPassword) {
                    res.end(JSON.stringify({ message: 'Authentication failed' }))
                } else {
                    // set includedRepositories in config.json
                    const Config = jsonfile.readFileSync(configPath)
                    Config.includedRepositories = includedRepositories
                    jsonfile.writeFileSync(configPath, Config, { spaces: 2 })
                    jsonfile.writeFileSync(configBackupPath, Config, { spaces: 2 })

                    res.end(JSON.stringify({ message: 'Success' }))
                }
            })
            break
        case '/setStartDate':
            if (req.method === 'GET') {
                res.end('Permission denied\n')
                return
            }
            Util.post(req, (params) => {
                const { token, startDate } = params

                if (token !== adminPassword) {
                    res.end(JSON.stringify({ message: 'Authentication failed' }))
                } else {
                    // set startDate in config.json
                    const Config = jsonfile.readFileSync(configPath)
                    Config.startDate = startDate
                    jsonfile.writeFileSync(configPath, Config, { spaces: 2 })
                    jsonfile.writeFileSync(configBackupPath, Config, { spaces: 2 })

                    res.end(JSON.stringify({ message: 'Success' }))
                }
            })
            break
        case '/setInterval':
            if (req.method === 'GET') {
                res.end('Permission denied\n')
                return
            }

            Util.post(req, (params) => {
                const { token, interval } = params

                if (token !== adminPassword) {
                    res.end(JSON.stringify({ message: 'Authentication failed' }))
                } else {
                    // set delay in config.json
                    const Config = jsonfile.readFileSync(configPath)
                    Config.delay = interval
                    jsonfile.writeFileSync(configPath, Config, { spaces: 2 })
                    jsonfile.writeFileSync(configBackupPath, Config, { spaces: 2 })

                    res.end(JSON.stringify({ message: 'Success' }))
                }
            })
            break
        case '/remove':
            if (req.method === 'GET') {
                res.end('Permission denied\n')
                return
            }

            Util.post(req, (params) => {
                const { token, username } = params

                if (token !== adminPassword) {
                    res.end(JSON.stringify({ message: 'Authentication failed' }))
                } else {
                    const Config = jsonfile.readFileSync(configPath)
                    // Remove this contributor in config.json
                    Config.contributors.forEach((contributor, index, object) => {
                        if (contributor == username) {
                            object.splice(index, 1)
                        }
                    })
                    jsonfile.writeFileSync(configPath, Config, { spaces: 2 })

                    // Remove this contributor in the data.json
                    const data = jsonfile.readFileSync(dataPath)
                    delete data[username]
                    jsonfile.writeFileSync(dataPath, data, { spaces: 2 })
                    jsonfile.writeFileSync(configBackupPath, Config, { spaces: 2 })

                    res.end(JSON.stringify({ message: 'Success' }))
                }
            })
            break
        case '/add':
            if (req.method === 'GET') {
                res.end('Permission denied\n')
                return
            }

            Util.post(req, (params) => {
                const { token, username } = params

                if (token !== adminPassword) {
                    res.end(JSON.stringify({ message: 'Authentication failed' }))
                } else {
                    const Config = jsonfile.readFileSync(configPath)

                    if (Config.contributors.includes(username)) {
                        res.end(JSON.stringify({ message: `${username} aready exists` }))
                        return
                    }

                    API.getContributorAvatar(username).then((result) => {
                        if (result === '') {
                            res.end(JSON.stringify({ message: 'Not found' }))
                        } else {
                            // Add this contributor in config.json
                            Config.contributors.unshift(username)
                            jsonfile.writeFileSync(configPath, Config, { spaces: 2 })
                            jsonfile.writeFileSync(configBackupPath, Config, { spaces: 2 })

                            // Add this contributor in the data.json
                            const data = jsonfile.readFileSync(dataPath)
                            API.getContributorInfo(
                                Config.organization,
                                username,
                                Config.includedRepositories
                            ).then((result) => {
                                if (
                                    result.avatarUrl !== '' &&
                    result.issuesNumber !== -1 &&
                    result.mergedPRsNumber !== -1 &&
                    result.openPRsNumber != -1
                                ) {
                                    data[`${username}`] = result
                                    // Update contributors infomation
                                    jsonfile.writeFile(dataPath, data, { spaces: 2 }, (err) => {
                                        if (err) console.error(err)
                                    })
                                }
                            })

                            res.end(
                                JSON.stringify({
                                    message: 'Success',
                                    avatarUrl: result,
                                })
                            )
                        }
                    })
                }
            })
            break
        case '/stats':
            if (req.method !== 'GET') {
                res.end('Permission denied\n')
                return
            }

            jsonfile.readFile(dataPath, async (err, obj) => {
                if (err) console.log('[ERROR]' + err)
                res.end(JSON.stringify(await API.getStats(obj)))
            })
            break
        case '/rank':
            if (req.method !== 'GET') {
                res.end('Permission denied\n')
                return
            }

            jsonfile.readFile(dataPath, async (err, obj) => {
                if (err) console.log('[ERROR]' + err)
                const query = url.parse(req.url, true).query

                // Gets list of contributors sorted by parameter if provided
                // else defaults to sorting by mergedprs
                const contributors = await API.getRanks(obj, query.parameter)

                // Responds with rank of username
                if (query.username) {
                    const rank =
              contributors
                  .map((c) => c.toLowerCase())
                  .indexOf(query.username.toLowerCase()) + 1
                    res.end(
                        JSON.stringify(
                            rank
                                ? {
                                    username: query.username,
                                    rank: rank,
                                }
                                : { error: `Contributor ${query.username} doesn't exist` }
                        )
                    )
                }
                // Responds with sorted list of contributors
                else {
                    res.end(JSON.stringify({ ranks: contributors }))
                }
            })
            break

        case '/contributor':
            if (req.method !== 'GET') {
                res.end('Permission denied\n')
                return
            }

            jsonfile.readFile(dataPath, async (err, obj) => {
                if (err) console.log('[ERROR]' + err)
                const query = url.parse(req.url, true).query

                if (query.username) {
                    res.end(
                        JSON.stringify(
                            obj[query.username]
                                ? obj[query.username]
                                : { error: `Contributor ${query.username} doesn't exist` }
                        )
                    )
                } else if (query.rank) {
                    // Gets list of contributors sorted by parameter if provided
                    // else defaults to sorting by mergedprs
                    const contributors = await API.getRanks(obj, query.parameter)
                    res.end(JSON.stringify(obj[contributors[query.rank - 1]]))
                } else {
                    res.end(JSON.stringify(obj))
                }
            })
            break
        default:
            res.end('Permission denied\n')
            break
        }
    })
    .listen(port)

const io = require('socket.io')(server)
io.on('connection', (socket) => {
    const intervalId = setInterval(() => {
        jsonfile.readFile(dataPath, (err, obj) => {
            if (err) console.log('[ERROR]' + err)
            socket.emit('refresh table', obj)
        })
    }, 15000)
    socket.on('disconnect', () => {
        clearInterval(intervalId)
    })
})

function findContributor(contributorName, admindata) {
    let result = null

    admindata.forEach((contributor) => {
        if (contributor.username === contributorName) {
            result = contributor
        }
    })

    return result
}
