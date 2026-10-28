# Jeffy 요청과 모듈 연결

실제 코드: [jeffy/index.ts](../../jeffy/index.ts)

`jeffy()`는 한 요청의 세션 준비, 질문 기록, 에이전트 실행, 답변 기록을 순서대로 연결합니다.

**입력과 출력**

- 필수 입력: `input`, `baseUrl`, `gatewayToken`, `model`.
- 선택 입력: `sessionId`, `instructions`, `maximumTurns`, `workspaceRoot`, `conversationsDirectory`.
- 출력: `{ sessionId, answer }`.
- 호출하는 모듈: session manager, tool calling, LLM client, agent loop.

```text
jeffy(설정):
    작업 폴더 = 설정.workspaceRoot 또는 현재 실행 폴더
    세션 폴더 = 설정.conversationsDirectory 또는 작업 폴더/conversations

    세션 관리자 = createSessionManager(세션 폴더)
    도구 시스템 = createToolCallingSystem(작업 폴더)
    모델 호출 함수 = createLlmClient(설정, 도구 시스템.tools)

    설정.sessionId가 생략되었으면:
        세션 = 세션 관리자.createNewSession()
    아니면:
        세션 = 세션 관리자.loadSession(sessionId를 문자열로 변환)

    세션.messages에 사용자 질문을 추가한다
    세션 관리자.saveSession(세션.id, 세션.messages)

    { answer: 답변, newMessages } = runAgent(세션.messages, {
        callModel: 모델 호출 함수,
        executeTool: 도구 시스템.executeTool,
        maximumTurns: 설정.maximumTurns
    })

    세션.messages에 newMessages(도구 호출, 결과, 최종 답변)를 추가한다
    세션 관리자.saveSession(세션.id, 세션.messages)

    { sessionId: 세션.id, answer: 답변 }을 반환한다
```

질문과 답변을 대화에 추가하는 주체는 이 파일입니다. session manager는 전달받은 대화를 파일로 저장합니다. 실행 도중 오류가 올라오면 `jeffy()`도 실패하며, 그 전에 저장한 사용자 질문은 파일에 남습니다.
