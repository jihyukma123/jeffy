# 모델 요청과 응답 해석

실제 코드: [jeffy/llm-client.ts](../../jeffy/llm-client.ts)

`createLlmClient()`는 Gateway 설정(`baseUrl`, `gatewayToken`, `model`)과 도구 정의를 기억하는 모델 호출 함수 `callModel`을 반환합니다.

**입력과 출력**

- 생성 입력: `baseUrl`, `gatewayToken`, `model`, 선택적인 `instructions`, 도구 정의 목록.
- 생성 출력: `callModel(inputItems)` 함수.
- 호출 입력: 지금까지 누적된 모델 입력 목록 `inputItems`.
- 호출 출력: `{ output, outputText }` 형태의 `ModelTurn`.

```text
createLlmClient(설정, 도구 정의):
    baseUrl, gatewayToken, model 중 하나라도 없으면 오류를 발생시킨다

    OpenAI 클라이언트를 생성한다:
        apiKey = gatewayToken
        baseURL = baseUrl
        maxRetries = 0

    다음 callModel 함수를 만들어 반환한다

    callModel(inputItems):
        OpenAI 클라이언트로 스트리밍 응답(client.responses.create)을 생성한다:
            model = 설정.model
            instructions = 설정.instructions 또는 기본 지침
            tools = 도구 정의
            input = inputItems
            stream = true
            store = false

        outputText = 빈 문자열
        completedItems = 빈 목록
        completedOutput = 아직 없음
        observedEventTypes = 빈 집합

        이벤트 스트림을 순회한다 (for await event of stream):
            이벤트 종류를 observedEventTypes에 기록한다

            error, response.failed, response.incomplete 이벤트이면:
                오류를 발생시킨다

            response.output_text.delta 이벤트이면:
                텍스트 조각을 outputText에 추가한다

            response.output_item.done 이벤트이면:
                완성된 출력 항목을 completedItems에 추가한다

            response.completed 이벤트이면:
                응답의 전체 output 목록을 completedOutput에 보관한다

        output = completedItems가 있으면 completedItems
                 아니면 completedOutput
                 둘 다 없으면 빈 목록

        output도 비었고 outputText도 비었으면:
            관찰한 이벤트 종류를 포함한 오류를 발생시킨다

        { output, outputText }를 반환한다
```

OpenAI SDK가 SSE 수신 및 이벤트 파싱을 담당하며, 클라이언트는 비동기 이터레이터(`stream`)를 통해 구조화된 이벤트를 직접 처리합니다.

이 모듈은 출력 항목을 모아 반환합니다. 그중 도구 호출을 찾아 실행하거나 다시 모델을 부르는 일은 agent loop에서 처리합니다. 텍스트 조각은 이곳에서 모으고, 터미널 출력은 최종 반환 이후에 이루어집니다.
