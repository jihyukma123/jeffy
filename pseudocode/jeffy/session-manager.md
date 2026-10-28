# 대화 세션 생성과 저장

실제 코드: [jeffy/session-manager.ts](../../jeffy/session-manager.ts)

`createSessionManager()`는 세션 저장 폴더를 기억하는 생성·조회·저장 함수들을 반환합니다.

**데이터 형식**

```text
ConversationMessage = 
    | { type: "user", text: 문자열 }
    | { type: "assistant", text: 문자열 }
    | { type: "tool_call", call_id: 문자열, name: 문자열, arguments: 문자열 }
    | { type: "tool_result", call_id: 문자열, name: 문자열, output: 문자열 }
세션 = { id: 숫자, messages: ConversationMessage 목록 }
저장 파일 = 세션 폴더/{id}.json
파일 내용 = messages 배열
```

**입력과 출력**

- 생성 입력: 세션 폴더 경로. 생략하면 현재 실행 폴더의 `conversations`.
- 생성 출력: `{ createNewSession, loadSession, saveSession }`.
- 호출하는 기능: 파일시스템의 폴더 생성, 목록 조회, 파일 읽기와 쓰기.

```text
createSessionManager(세션 폴더):
    다음 함수들이 같은 세션 폴더를 사용하게 만든다

    sessionPath(세션 ID):
        세션 폴더/{세션 ID}.json 경로를 반환한다

    createNewSession():
        세션 폴더가 없으면 만든다
        폴더 안에서 양의 정수 이름을 가진 JSON 파일들을 찾는다

        기존 ID가 없으면 새 ID = 1
        아니면 새 ID = 기존 ID 중 최댓값 + 1

        messages = 빈 목록
        saveSession(새 ID, messages)
        { id: 새 ID, messages }를 반환한다

    loadSession(세션 ID 문자열):
        ID가 1 이상의 정수 형식이 아니면 오류를 발생시킨다
        ID를 숫자로 변환한다

        파일을 읽고 JSON으로 해석한다
            파일이 없으면 세션을 찾을 수 없다는 오류를 발생시킨다
            다른 읽기·JSON 해석 오류는 그대로 전달한다

        파일 내용이 배열인지 확인한다
        모든 원소가 isConversationMessage인지 확인한다
        형식이 맞지 않으면 오류를 발생시킨다

        { id: ID, messages: 파일에서 읽은 배열 }을 반환한다

    isConversationMessage(값):
        값이 객체이고,
        - type이 user 또는 assistant이면 text가 문자열인지 확인
        - type이 tool_call이면 call_id, name, arguments가 문자열인지 확인
        - type이 tool_result이면 call_id, name, output이 문자열인지 확인
        위 조건 중 하나를 만족하는지 반환한다

    saveSession(세션 ID, messages):
        세션 폴더가 없으면 만든다
        messages를 JSON 문자열로 바꾼다
        해당 세션 파일을 덮어쓴다

    { createNewSession, loadSession, saveSession }을 반환한다
```

저장된 배열에는 사용자 질문과 최종 답변이 들어갑니다. 세션 ID는 파일 이름에 있고, 도구 호출과 실행 결과는 이 배열에 포함되지 않습니다.
