import re
from typing import List, Dict, Any, Tuple
from ..schemas.note import Note
from ..schemas.question import QuizQuestion

def _build_shared_qaprompt(question_count: int = 20, prompt_type_spec: str = '["mcq"]') -> str:
    return (
        "You are given a set of notes or an article.\n"
        f"Read and understand the content, then generate approximately {question_count} questions.\n"
        f"Requested question type(s): {prompt_type_spec}\n"
        "Most questions should be drawn directly from the material, focusing on key concepts, definitions,\n"
        "and core ideas, while a smaller portion can be creative or application-based,\n"
        "extending the material into real-world or novel scenarios but staying conceptually grounded.\n"
        "Include a mix of difficulty levels—beginner, intermediate, advanced, and professional.\n"
        "For each question, provide the question number, type (conceptual, application, analytical),\n"
        "difficulty, topic, the correct answer, and a brief explanation.\n"
        "If the requested question format requires options (for example MCQ), include the necessary answer choices.\n"
        "Focus on clarity, relevance, and meaningful application, avoiding trivial or overly obscure details.\n"
    )

def _parse_opening_tag_attrs(stripped: str, tag_name: str) -> Dict[str, str]:
    m = re.match(rf"^<{re.escape(tag_name)}(?P<attrs>[^>]*)/?>$", stripped, flags=re.IGNORECASE)
    if not m:
        return {}
    attrs_text = (m.group("attrs") or "").strip()
    if not attrs_text:
        return {}
    attrs: Dict[str, str] = {}
    attr_pattern = re.compile(
        r"""([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\[[^\]]*\])|([^\s>]+))"""
    )
    for match in attr_pattern.finditer(attrs_text):
        key = match.group(1).strip().lower()
        value = next((g for g in match.groups()[1:] if g is not None), "")
        attrs[key] = value.strip()
    return attrs

def extract_source_meta(source_text: str) -> Tuple[Dict[str, str], str]:
    lines = (source_text or "").splitlines()
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i >= len(lines) or lines[i].strip() != "<meta>":
        return {}, source_text or ""

    i += 1
    meta_lines: List[str] = []
    while i < len(lines) and lines[i].strip() != "</meta>":
        meta_lines.append(lines[i])
        i += 1
    if i >= len(lines):
        return {}, source_text or ""

    body_lines = lines[i + 1 :]
    meta: Dict[str, str] = {}
    for raw in meta_lines:
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"^([A-Za-z0-9_ -]+)\s*[:=]\s*(.*)$", line)
        if not m:
            continue
        key = m.group(1).strip().lower().replace(" ", "_").replace("-", "_")
        value = m.group(2).strip()
        if value:
            meta[key] = value

    body = "\n".join(body_lines).lstrip("\n")
    return meta, body

def parse_markdown_to_note(md_content: str) -> Note:
    """
    Parses a markdown document with <meta> and <qquiz> blocks into a Note schema.
    """
    if not md_content or not md_content.strip():
        return Note(
            title="Untitled",
            success=False,
            summary="",
            content="",
            related_concepts=[],
            qa=[],
            quizzes=[],
            qprompt=None,
            raw_markdown=md_content,
            error_messages=["Empty markdown content"]
        )

    # 1. Parse Metadata
    meta, body = extract_source_meta(md_content)
    
    title = meta.get("title", "Untitled").strip()
    summary = meta.get("summary", "").strip()
    
    success_val = meta.get("success", "true").strip().lower()
    success = success_val in ("true", "1", "yes")
    
    related_raw = meta.get("related_concepts") or meta.get("relatedconcepts") or ""
    related_concepts = [c.strip() for c in related_raw.split(",") if c.strip()]
    
    errors_raw = meta.get("error_messages") or meta.get("errormessages") or ""
    error_messages = [e.strip() for e in errors_raw.split(",") if e.strip()]

    # 2. Extract quizzes and qprompt, and build core markdown content
    lines = body.splitlines()
    core_lines: List[str] = []
    quizzes: List[QuizQuestion] = []
    qprompt_text = None
    
    i = 0
    in_fence = False
    
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Track code fences so we don't process tags inside code blocks
        if stripped.startswith("```"):
            in_fence = not in_fence
            core_lines.append(line)
            i += 1
            continue
            
        if in_fence:
            core_lines.append(line)
            i += 1
            continue

        # Handle <qquiz> tag
        quiz_tag = re.match(r"^<(qquiz)(?:\s+[^>]*)?\s*(/?)>$", stripped, flags=re.IGNORECASE)
        if quiz_tag:
            # Skip self-closing or inline quiz tag
            if quiz_tag.group(2) == "/":
                i += 1
                continue
                
            i += 1
            while i < len(lines):
                q_inner = lines[i].rstrip("\n")
                q_inner_stripped = q_inner.strip()
                if q_inner_stripped == "</qquiz>":
                    break
                
                if q_inner_stripped == "<question>":
                    i += 1
                    q_dict: Dict[str, str] = {}
                    current_key = ""
                    while i < len(lines):
                        qline = lines[i].rstrip("\n")
                        qstripped = qline.strip()
                        if qstripped == "</question>":
                            break
                        m_kv = re.match(
                            r"^(question|a|b|c|d|answer|explanation|responsea|responseb|responsec|responsed)\s*:\s*(.*)$",
                            qstripped,
                            flags=re.IGNORECASE,
                        )
                        if m_kv:
                            current_key = m_kv.group(1).strip().lower()
                            q_dict[current_key] = m_kv.group(2).strip()
                        elif current_key in ("explanation", "question") and qstripped:
                            q_dict[current_key] = (q_dict.get(current_key, "") + "\n" + qline).strip()
                        i += 1
                    
                    if q_dict and "question" in q_dict and "a" in q_dict and "b" in q_dict and "answer" in q_dict:
                        quizzes.append(
                            QuizQuestion(
                                question=q_dict.get("question", ""),
                                a=q_dict.get("a", ""),
                                responsea=q_dict.get("responsea"),
                                b=q_dict.get("b", ""),
                                responseb=q_dict.get("responseb"),
                                c=q_dict.get("c"),
                                responsec=q_dict.get("responsec"),
                                d=q_dict.get("d"),
                                responsed=q_dict.get("responsed"),
                                answer=q_dict.get("answer", "").strip().lower(),
                                explanation=q_dict.get("explanation")
                            )
                        )
                i += 1
            i += 1
            continue

        # Handle <qprompt> tag
        qprompt_tag = re.match(r"^<(qprompt)(?:\s+[^>]*)?\s*(/?)>$", stripped, flags=re.IGNORECASE)
        if qprompt_tag:
            attrs = _parse_opening_tag_attrs(stripped, "qprompt")
            count = int(attrs.get("count", "20"))
            type_spec = attrs.get("type", '["mcq"]')
            qprompt_text = _build_shared_qaprompt(count, type_spec)
            
            # Read until closing tag if not self-closing
            if qprompt_tag.group(2) != "/":
                i += 1
                while i < len(lines) and lines[i].strip() != "</qprompt>":
                    i += 1
            i += 1
            continue

        # Normal line of core markdown
        core_lines.append(line)
        i += 1

    core_markdown = "\n".join(core_lines).strip()
    
    # Generate default qprompt if not found but requested
    if not qprompt_text:
        qprompt_text = _build_shared_qaprompt()

    return Note(
        title=title,
        success=success,
        summary=summary,
        content=core_markdown,
        related_concepts=related_concepts,
        qa=[],  # Kept empty for markdown notes since we use quizzes
        quizzes=quizzes,
        qprompt=qprompt_text,
        raw_markdown=md_content,
        error_messages=error_messages
    )

def format_note_to_markdown(note: Note) -> str:
    """
    Formats a Note object to the Ludwigia-style markdown string.
    """
    # 1. Meta Block
    meta_lines = [
        "<meta>",
        f"Title: {note.title}",
        f"Success: {str(note.success).lower()}",
        f"Summary: {note.summary}",
        f"RelatedConcepts: {', '.join(note.related_concepts)}",
    ]
    if note.error_messages:
        meta_lines.append(f"ErrorMessages: {', '.join(note.error_messages)}")
    meta_lines.append("</meta>")
    
    parts = ["\n".join(meta_lines)]
    
    # 2. Core Markdown Content
    if note.content:
        parts.append(note.content)
        
    # 3. Quizzes Block
    if note.quizzes:
        quiz_lines = ["<qquiz>", "title: Summary Quiz"]
        for q in note.quizzes:
            quiz_lines.append("<question>")
            quiz_lines.append(f"Question: {q.question}")
            quiz_lines.append(f"A: {q.a}")
            if q.responsea:
                quiz_lines.append(f"ResponseA: {q.responsea}")
            quiz_lines.append(f"B: {q.b}")
            if q.responseb:
                quiz_lines.append(f"ResponseB: {q.responseb}")
            if q.c:
                quiz_lines.append(f"C: {q.c}")
                if q.responsec:
                    quiz_lines.append(f"ResponseC: {q.responsec}")
            if q.d:
                quiz_lines.append(f"D: {q.d}")
                if q.responsed:
                    quiz_lines.append(f"ResponseD: {q.responsed}")
            quiz_lines.append(f"Answer: {q.answer.upper()}")
            if q.explanation:
                quiz_lines.append(f"Explanation: {q.explanation}")
            quiz_lines.append("</question>")
        quiz_lines.append("</qquiz>")
        parts.append("\n".join(quiz_lines))
        
    # 4. Prompt tag
    parts.append("<qprompt/>")
    
    return "\n\n".join(parts) + "\n"
