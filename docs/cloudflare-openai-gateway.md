# Cloudflare OpenAI Gateway 연결

## 목적

로컬 `jeffy`에는 실제 OpenAI API 키를 두지 않는다. 로컬은 별도의
`GATEWAY_TOKEN`으로 Cloudflare Worker를 호출하고, Worker가 이 토큰을 검사한 뒤
Cloudflare Secret에 저장된 `OPENAI_API_KEY`로 인증 헤더를 교체한다.

```text
jeffy
  POST /v1/responses + GATEWAY_TOKEN
    -> Cloudflare Worker
       경로/토큰 검사 + Authorization 교체
         -> https://api.openai.com/v1/responses
            SSE 스트림을 그대로 반환
```

Worker는 다음 요청만 허용한다.

- `POST /v1/responses`
- `POST /v1/chat/completions`
- `POST /v1/embeddings`

## 1. Cloudflare 로그인

프로젝트 루트에서 실행한다.

```bash
npx wrangler login
```

브라우저에서 Cloudflare 계정을 승인한 뒤 확인한다.

```bash
npx wrangler whoami
```

Cloudflare 계정 이메일 인증이 끝나 있어야 한다. 새 계정이면 받은 인증 메일의
링크를 먼저 누르고, Dashboard의 Workers 온보딩에서 사용 가능한
`workers.dev` 계정 서브도메인을 한 번 등록한다. 이 서브도메인은 개별 Worker
이름이 아니라 계정의 공통 주소 부분이다.

## 2. Worker 최초 배포

```bash
npm run gateway:deploy
```

출력되는 주소를 기록한다. 기본 이름을 바꾸지 않았다면 다음과 같은 형태다.

```text
https://jeffy-openai-gateway.YOUR_SUBDOMAIN.workers.dev
```

Secret을 등록하기 전에는 API 요청이 `500`으로 실패하는 것이 정상이다.

## 3. Cloudflare Secret 등록

실제 OpenAI API 키를 대화, 소스 코드 또는 명령행 인자에 붙여 넣지 않는다.
다음 명령을 실행하면 Wrangler가 값을 대화형으로 입력받는다.

```bash
npm run gateway:secret:openai
```

프롬프트에 기존 OpenAI API 키를 직접 입력한다. Secret 이름은
`OPENAI_API_KEY`여야 한다.

다음으로 로컬 전용 Gateway Token을 생성해 Cloudflare와 `.env.local`에 같은
값을 넣는다. 아래 명령은 토큰 값을 터미널에 출력하지 않는다. 모델을 생략하면
`gpt-6-luna`를 사용한다.

```bash
npm run gateway:configure-local -- \
  https://jeffy-openai-gateway.YOUR_SUBDOMAIN.workers.dev/v1 \
  gpt-6-luna
```

`.env.local`은 Git에서 제외되어 있다. 실제 OpenAI 키는 이 파일에 들어가지
않으며 Cloudflare에만 저장된다.

Cloudflare Dashboard에서 등록하려면 `Workers & Pages`에서
`jeffy-openai-gateway`를 선택하고 `Settings > Variables and Secrets`에서
`OPENAI_API_KEY`, `GATEWAY_TOKEN`을 각각 **Secret** 타입으로 추가한다.

## 4. 연결 확인

공개 상태 확인 엔드포인트는 OpenAI를 호출하지 않는다.

```bash
source .env.local
curl "${OPENAI_BASE_URL%/v1}/healthz"
```

예상 응답:

```json
{"ok":true}
```

인증 없이 OpenAI 경로를 호출하면 `401`이어야 한다.

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST "$OPENAI_BASE_URL/responses"
```

마지막으로 로컬 agent를 실행한다. 이 단계부터 실제 OpenAI 사용량이 발생한다.

```bash
npm run gateway:smoke
npm start
```

## 5. 공식 SDK에서 재사용

Worker는 OpenAI의 `/v1` 경로를 유지하므로 다른 로컬 프로젝트에서도 같은
주소와 Gateway Token을 사용할 수 있다.

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GATEWAY_TOKEN,
  baseURL: process.env.OPENAI_BASE_URL,
});

const stream = await client.responses.create({
  model: process.env.OPENAI_MODEL!,
  input: "Hello",
  stream: true,
});

for await (const event of stream) {
  console.log(event);
}
```

## 운영 시 기억할 점

- `GATEWAY_TOKEN`도 OpenAI 비용을 발생시킬 수 있는 비밀값이다.
- 토큰이 노출되면 `npm run gateway:secret:token`으로 교체하고 모든 로컬
  `.env.local`을 함께 갱신한다.
- Worker는 요청/응답 본문을 로깅하지 않는다.
- 개인 실험은 `workers.dev`로 시작해도 된다. 중요 서비스라면 Cloudflare의
  Custom Domain과 추가적인 Rate Limiting 정책을 검토한다.
- OpenAI Secret 등록: <https://developers.cloudflare.com/workers/configuration/secrets/>
- Cloudflare 스트리밍: <https://developers.cloudflare.com/workers/runtime-apis/streams/>
- OpenAI 인증: <https://developers.openai.com/api/reference/overview>
- OpenAI SSE 스트리밍: <https://developers.openai.com/api/docs/guides/streaming-responses>
