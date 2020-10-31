import { interval, animationFrameScheduler, merge, fromEvent, Observable, Subject, Subscriber } from 'rxjs'
import { map, scan, distinctUntilChanged, withLatestFrom, retryWhen, delay, share, mergeWith, tap } from 'rxjs/operators'

interface Brick {
  x: number
  y: number
  width: number
  height: number
}

interface Ball {
  position: {
    x: number
    y: number
  }
  direction: {
    x: number
    y: number
  }
}

interface TickerTime {
  time:  number,
  deltaTime: number
}

const stage = document.getElementById('stage') as HTMLCanvasElement
const context = stage.getContext('2d')!
context.fillStyle = 'green'

const PADDLE_WIDTH  = 100
const PADDLE_HEIGHT = 20

const BALL_RADIUS = 10

const BRICK_ROWS    = 5
const BRICK_COLUMNS = 7
const BRICK_HEIGHT  = 20
const BRICK_GAP     = 3

function drawIntro() {
  context.clearRect(0, 0, stage.width, stage.height)
  context.textAlign = 'center'
  context.font = '24px Courier New'
  context.fillText('Press [<] and [>] To Move Paddle', stage.width / 2, stage.height / 2)
}

function drawGameOver(text: string) {
  context.clearRect(stage.width / 4, stage.height / 3, stage.width / 2, stage.height / 3)
  context.textAlign = 'center'
  context.font = '24px Courier New'
  context.fillText(text, stage.width / 2, stage.height / 2)
}

function drawScore(score: number) {
  context.textAlign = 'left'
  context.font = '16px Courier New'
  context.fillText(String(score), BRICK_GAP, 16)
}

function drawPaddle(position: number) {
  context.beginPath()
  context.rect(
    position - PADDLE_WIDTH / 2,
    context.canvas.height - PADDLE_HEIGHT,
    PADDLE_WIDTH,
    PADDLE_HEIGHT
  )
  context.fill()
  context.closePath()
}

function drawBall(ball: Ball) {
  context.beginPath()
  context.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2)
  context.fill()
  context.closePath()
}

function drawBrick(brick: Brick) {
  context.beginPath()
  context.rect(
    brick.x - brick.width / 2,
    brick.y - brick.height / 2,
    brick.width,
    brick.height
  )
  context.fill()
  context.closePath()
}

function drawBricks(bricks: Brick[]) {
  bricks.forEach(brick => drawBrick(brick))
}


const TICKER_INTERVAL = Math.ceil(1000 / 60)

const ticker$: Observable<TickerTime> = interval(TICKER_INTERVAL, animationFrameScheduler)
  .pipe(
    map(() => ({
      time: Date.now(),
      deltaTime: 0
    })),
    scan((previous, current) => ({
      time: current.time,
      deltaTime: (current.time - previous.time) / 1000
    })),
    share()
  )

const PADDLE_CONTROLS: {
  ArrowLeft: number,
  ArrowRight: number
  [key: string]: number
} = {
  'ArrowLeft': -1,
  'ArrowRight': 1
}

const key$ = merge(
    fromEvent<KeyboardEvent>(document, 'keydown').pipe(map(e => (PADDLE_CONTROLS[e.key] || 0))),
    fromEvent(document, 'keyup').pipe(map(() => 0))
  ).pipe(distinctUntilChanged())

const PADDLE_SPEED = 240

const createPaddle$ = (ticker$: Observable<TickerTime>) => ticker$.pipe(
  withLatestFrom(key$),
  scan((position, [ticker, direction]) => {
    const nextPosition = position + direction * ticker.deltaTime * PADDLE_SPEED
    return Math.max(
      Math.min(nextPosition, stage.width - PADDLE_WIDTH / 2),
      PADDLE_WIDTH / 2
    )
  }, stage.width / 2),
  distinctUntilChanged()
)

function isHit(paddle: number, ball: Ball) {
  return ball.position.x > paddle - PADDLE_WIDTH / 2
    && ball.position.x < paddle + PADDLE_WIDTH / 2
    && ball.position.y > stage.height - PADDLE_HEIGHT - BALL_RADIUS / 2
}

function isCollision(brick: Brick, ball: Ball) {
  return ball.position.x + ball.direction.x > brick.x - brick.width / 2
  && ball.position.x + ball.direction.x < brick.x + brick.width / 2
  && ball.position.y + ball.direction.y > brick.y - brick.height / 2
  && ball.position.y + ball.direction.y < brick.y + brick.height / 2
}

function createBricks() {
  let width = (stage.width - BRICK_GAP - BRICK_GAP * BRICK_COLUMNS) / BRICK_COLUMNS
  let bricks = []

  for (let i = 0; i < BRICK_ROWS; i++) {
    for (let j = 0; j < BRICK_COLUMNS; j++) {
      bricks.push({
        x: j * (width + BRICK_GAP) + width / 2 + BRICK_GAP,
        y: i * (BRICK_HEIGHT + BRICK_GAP) + BRICK_HEIGHT / 2 + BRICK_GAP + 20,
        width: width,
        height: BRICK_HEIGHT
      })
    }
  }

  return bricks
}

const initState = () => ({
  ball: {
    position: {
      x: stage.width / 2,
      y: stage.height / 2
    },
    direction: {
      x: 2,
      y: 2
    }
  },
  bricks: createBricks(),
  score: 0
})

const BALL_SPEED = 60

const createState$ = (ticker$: Observable<TickerTime>, paddle$: Observable<number>) =>
  ticker$.pipe(
    withLatestFrom(paddle$),
    scan(({ball, bricks, score}, [ticker, paddle]) => {
      let remainingBricks: Brick[] = []
      const collisions = {
        paddle: false,
        floor: false,
        wall: false,
        ceiling: false,
        brick: false
      }

      ball.position.x = ball.position.x + ball.direction.x * ticker.deltaTime * BALL_SPEED
      ball.position.y = ball.position.y + ball.direction.y * ticker.deltaTime * BALL_SPEED

      bricks.forEach((brick) => {
        if (!isCollision(brick, ball)) {
          remainingBricks.push(brick)
        } else {
          collisions.brick = true
          score = score + 10
        }
      })

      collisions.paddle = isHit(paddle, ball)

      if (ball.position.x < BALL_RADIUS || ball.position.x > stage.width - BALL_RADIUS) {
        ball.direction.x = -ball.direction.x
        collisions.wall = true
      }

      collisions.ceiling = ball.position.y < BALL_RADIUS

      if (collisions.brick || collisions.paddle || collisions.ceiling ) {
        ball.direction.y = -ball.direction.y
      }

      return {
        ball: ball,
        bricks: remainingBricks,
        collisions: collisions,
        score: score
      }

    }, initState())
  )


function updateView([, paddle, state]: any) {
  context.clearRect(0, 0, stage.width, stage.height)

  drawPaddle(paddle)
  drawBall(state.ball)
  drawBricks(state.bricks)
  drawScore(state.score)

  if (state.ball.position.y > stage.height - BALL_RADIUS) {
    drawGameOver('GAME OVER')
    restart.error('game over')
  }

  if (state.bricks.length === 0) {
    drawGameOver('Congradulations!')
    restart.error('cong')
  }
}

let restart: Subject<never>

new Observable((observer) => {
  drawIntro()

  restart = new Subject()

  const paddle$ = createPaddle$(ticker$)
  const state$ = createState$(ticker$, paddle$)

  ticker$.pipe(
    withLatestFrom(paddle$, state$),
    mergeWith(restart)
  ).subscribe(observer)
})
.pipe(
  retryWhen(err$ => err$.pipe(
    tap(err => console.error(err)),
    delay(1000)
  ))
)
.subscribe(updateView)
