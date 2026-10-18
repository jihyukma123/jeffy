# 터미널에서 Jeffy 실행하기

실제 코드: [minimal_agent.ts](../minimal_agent.ts)

사용자에게 세션 ID와 질문을 받고 `jeffy()`에 전달합니다. 호출 한 번으로 질문 하나를 처리하고 프로그램을 종료합니다.

**입력과 출력**

- 입력: 환경 변수(OPENAI_BASE_URL, GATEWAY_TOKEN, OPENAI_MODEL), 터미널에서 받은 세션 ID와 질문.
- 출력: 최종 답변. 실패하면 오류 메시지와 실패 종료 코드.
- 호출하는 모듈: `jeffy/index.ts`.

```text
baseUrl = process.env.OPENAI_BASE_URL
gatewayToken = process.env.GATEWAY_TOKEN
model = process.env.OPENAI_MODEL

main():
    baseUrl, gatewayToken, model 중 하나라도 비어 있으면:
        .env.local 설정 안내와 함께 오류를 발생시킨다

    터미널 입출력을 연다

    try:
        세션 ID = 사용자에게 묻고 앞뒤 공백을 제거한다
        질문 = 사용자에게 묻는다

        질문이 빈 문자열이면:
            종료한다

        결과 = jeffy({
            input: 질문,
            sessionId: 세션 ID가 비어 있으면 생략,
            baseUrl,
            gatewayToken,
            model
        })

        결과.answer를 출력한다

    finally:
        터미널 입출력을 닫는다

main()을 실행한다
실패하면:
    오류 메시지를 출력한다
    프로세스 종료 코드를 1로 설정한다
```
