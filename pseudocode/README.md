# Jeffy 모듈과 실행 흐름

현재 구현을 코드 파일별 의사코드로 풀어 쓴 설명입니다. 함수 이름은 실제 코드와 맞추고, TypeScript 문법과 통신 세부사항을 줄였습니다.

**전체 구조**

```text
minimal_agent.ts                  터미널에서 질문을 받고 답변을 출력
  └─ jeffy/index.ts               한 요청의 시작과 종료를 연결
       ├─ session-manager.ts      대화 파일 생성·조회·저장
       ├─ tool-calling.ts         도구 목록과 실행 함수 준비
       ├─ llm-client.ts           도구 목록과 설정을 받아 모델 호출 함수 준비
       └─ agent-loop.ts           모델 호출 함수를 반복 실행
            ├─ callModel()        LLM 클라이언트가 제공한 함수
            └─ executeTool()      도구 시스템이 제공한 함수
```

`createLlmClient()`, `createSessionManager()`, `createToolCallingSystem()`은 설정을 기억하는 함수들을 만들어 반환합니다. 이 생성 함수를 부르는 것만으로 모델 요청이나 파일 읽기가 실행되지는 않습니다.

**한 요청의 흐름**

```text
사용자 질문 받기
→ jeffy(질문, 설정, 선택적인 세션 ID)
→ 세션 생성 또는 불러오기
→ 질문을 대화에 추가하고 저장
→ 모델 호출
→ 도구 호출이 있으면 실행하고, 결과를 붙여 다시 모델 호출
→ 도구 호출이 없으면 텍스트 답변 반환
→ 답변을 대화에 추가하고 저장
→ 터미널에 답변 출력
```

다음 행동을 선택하는 것은 모델입니다. 에이전트 루프는 모델이 요청한 도구를 실행하고 결과를 다시 전달합니다. 현재 종료 기준은 모델 출력에 도구 호출이 있는지 여부입니다.

**파일별 읽기 순서**

| 순서 | 의사코드 | 확인할 내용 |
|---|---|---|
| 1 | [minimal_agent](minimal_agent.md) | 사용자가 프로그램을 어떻게 실행하는가 |
| 2 | [index](jeffy/index.md) | 네 모듈을 어떻게 연결하는가 |
| 3 | [agent loop](jeffy/agent-loop.md) | 도구 실행 후 어떻게 다시 모델을 호출하는가 |
| 4 | [tool calling](jeffy/tool-calling.md) | 도구 설명과 실제 실행은 어떻게 연결되는가 |
| 5 | [LLM client](jeffy/llm-client.md) | 모델 응답을 어떤 데이터로 돌려주는가 |
| 6 | [session manager](jeffy/session-manager.md) | 어떤 대화를 파일에 저장하는가 |

**모듈 사이를 오가는 데이터**

| 이름 | 내용 | 사용하는 곳 |
|---|---|---|
| `messages` | 사용자와 assistant의 대화 및 도구 호출/결과 trace | index가 추가하고 session manager가 저장 |
| `inputItems` | 대화 기록을 모델 형식으로 바꾼 뒤, 현재 실행의 모델 출력과 도구 결과를 누적한 목록 | agent loop가 구성하고 LLM client에 전달 |
| `ModelTurn` | 모델 출력 항목 목록 `output`과 누적 답변 텍스트 `outputText` | LLM client가 반환하고 agent loop가 처리 |
| `ToolCall` | 도구 이름, JSON 문자열 인자, 호출 ID | 모델 출력에서 찾아 tool calling에 전달 |
| `function_call_output` | 도구 실행 결과와 대응하는 호출 ID | agent loop가 만들어 다음 모델 요청에 포함 |

`messages`는 파일에 남습니다. 이제 도구 호출(`tool_call`)과 결과(`tool_result`)도 `messages`에 보존되어 멀티턴 대화 시 모델이 이전 턴의 도구 실행 이력을 유지합니다. `inputItems`는 `runAgent()` 실행 중에 모델 규격으로 변환되어 사용되는 목록입니다.

**관심사에 따라 살펴볼 위치**

| 살펴볼 대상 | 위치 |
|---|---|
| 터미널 질문과 출력 | minimal_agent |
| 설정 전달과 대화 저장 순서 | index |
| 반복 조건과 실행 중 컨텍스트 누적 | agent loop |
| 요청 본문과 모델 응답 해석 | LLM client |
| 세션 ID와 저장 형식 | session manager |
| 도구 설명, 인자 해석, 실제 파일 읽기 | tool calling |
