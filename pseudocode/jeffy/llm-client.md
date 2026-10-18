# 모델 요청과 응답 해석

실제 코드: [jeffy/llm-client.ts](../../jeffy/llm-client.ts)

`createLlmClient()`는 인증정보·모델 설정·도구 정의를 기억하는 모델 호출 함수를 반환합니다. 호출 함수의 실제 이름은 `callCodex`이고, 다른 모듈에는 `callModel`이라는 이름으로 전달됩니다.

**입력과 출력**

- 생성 입력: 인증정보, 선택적인 모델 이름과 지침, 도구 정의 목록.
- 생성 출력: `callCodex(inputItems)` 함수.
- 호출 입력: 지금까지 누적된 모델 입력 목록 `inputItems`.
- 호출 출력: `{ output, outputText }` 형태의 `ModelTurn`.

```text
createLlmClient(설정, 도구 정의):
    다음 callCodex 함수를 만들어 반환한다

    callCodex(inputItems):
        토큰이나 계정 ID가 없으면 오류를 발생시킨다

        인증 헤더와 다음 본문으로 모델에 HTTP 요청을 보낸다:
            model = 설정.model 또는 기존 기본 모델
            instructions = 설정.instructions 또는 기본 지침
            tools = 도구 정의
            input = inputItems
            stream = true
            store = false

        HTTP 응답이 실패이면 오류를 발생시킨다
        응답 본문을 읽을 수 없으면 오류를 발생시킨다

        buffer = 아직 처리하지 못한 문자열
        outputText = 빈 문자열
        completedItems = 빈 목록
        completedOutput = 아직 없음
        observedEventTypes = 빈 집합

        응답 스트림을 끝까지 읽는다:
            바이트를 문자열로 바꿔 buffer에 붙인다
            줄바꿈까지 도착한 줄들을 handleSseLine()에 전달한다
            아직 완성되지 않은 마지막 줄은 buffer에 남긴다

        디코더와 buffer에 남은 내용도 처리한다

        output = completedItems가 있으면 completedItems
                 아니면 completedOutput
                 둘 다 없으면 빈 목록

        output도 비었고 outputText도 비었으면:
            관찰한 이벤트 종류를 포함한 오류를 발생시킨다

        { output, outputText }를 반환한다
```

SSE는 HTTP 응답을 여러 이벤트로 나누어 받는 형식입니다. 이 코드에서는 이벤트의 `data:` 줄에 담긴 JSON을 읽습니다.

```text
handleSseLine(줄):
    data:로 시작하지 않으면 무시한다
    data: 뒤의 내용을 꺼낸다
    내용이 비었거나 [DONE]이면 무시한다

    JSON 이벤트로 해석한다
        해석이 실패하면 오류를 발생시킨다

    이벤트 종류를 observedEventTypes에 기록한다

    error, response.failed, response.incomplete 이벤트이면:
        오류를 발생시킨다

    response.output_text.delta 이벤트이면:
        텍스트 조각을 outputText에 붙인다

    response.output_item.done 이벤트이면:
        완성된 출력 항목을 completedItems에 추가한다

    response.completed 이벤트이면:
        응답의 output 목록을 completedOutput에 보관한다
```

이 모듈은 출력 항목을 모아 반환합니다. 그중 도구 호출을 찾아 실행하거나 다시 모델을 부르는 일은 agent loop에서 처리합니다. 텍스트 조각은 이곳에서 모으고, 터미널 출력은 최종 반환 이후에 이루어집니다.

**별도로 호출하는 로그인 보조 함수**

현재 `minimal_agent.ts`와 `jeffy()`는 아래 로그인 함수를 호출하지 않습니다.

```text
loginAndRun():
    기기 인증 정보를 받는다                        // getDeviceCode
    인증 페이지 주소와 사용자 코드를 출력한다
    지정된 간격으로 인증 완료를 확인한다           // pollDeviceAuth
        인증 대기 응답이면 계속 확인한다
        인증 성공이면 인증 코드를 받는다
        다른 오류이면 실패한다
    인증 코드를 토큰으로 교환한다                 // exchangeToken
    토큰 payload에서 계정 ID를 꺼낸다             // extractAccountId
    인증 성공, 토큰, 계정 ID를 출력한다
```
