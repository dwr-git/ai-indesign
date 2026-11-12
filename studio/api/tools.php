<?php
// studio/api/tools.php — что помощник AI-InDesign знает о себе и какие действия ему разрешены.
//
// Инструменты выполняет БРАУЗЕР (studio.js): только он видит запущенный
// редактор. Сервер лишь объявляет модели, какие инструменты есть, и решает,
// какие из них доступны в текущем режиме.

/** Инструменты, которые ничего не меняют в публикации. Доступны в обоих режимах. */
function studio_read_tools(): array
{
    return [
        [
            'type' => 'function',
            'function' => [
                'name' => 'find_commands',
                'description' => 'Найти команды редактора по смыслу (по-русски или по-английски). '
                    . 'Возвращает id команды, русское название, путь в меню, горячую клавишу и описание параметров. '
                    . 'Вызывай перед run_command, если не знаешь точный id: id нельзя угадывать.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'query' => ['type' => 'string', 'description' => 'Что нужно сделать, 1–4 слова: «поля», «колонки», «стиль абзаца», «обтекание», «text frame», «swatch».'],
                    ],
                    'required' => ['query'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'get_state',
                'description' => 'Текущее состояние публикации: имя, сохранена ли, размер страницы (мм), страницы с полями и колонками, '
                    . 'рамки на каждой странице (id, вид, x/y/w/h в мм от левого верхнего угла страницы, история текста, начало текста, '
                    . 'overset — текст не помещается), стили абзацев и символов, образцы цвета, выделение.',
                'parameters' => ['type' => 'object', 'properties' => new stdClass()],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'read_text',
                'description' => 'Прочитать текст публикации: все истории (текст связанных рамок) или одну, абзацы с номерами. '
                    . 'Нужен, чтобы пересказать, проверить, найти что-то или отредактировать.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'story' => ['type' => 'integer', 'description' => 'Номер истории (поле story у текстовой рамки в get_state). Без него — все.'],
                    ],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'frame_details',
                'description' => 'Одна рамка подробно: границы в мм, страница, заливка и обводка, колонки, весь текст её истории, сколько символов не помещается.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'id' => ['type' => 'integer', 'description' => 'id рамки из get_state'],
                    ],
                    'required' => ['id'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'look_at_screen',
                'description' => 'Сделать снимок экрана редактора и посмотреть на него: проверить вёрстку или увидеть, как выглядит страница.',
                'parameters' => ['type' => 'object', 'properties' => new stdClass()],
            ],
        ],
    ];
}

/** Инструменты, которые меняют публикацию. Только в режиме «Сделай». */
function studio_act_tools(): array
{
    return [
        [
            'type' => 'function',
            'function' => [
                'name' => 'run_command',
                'description' => 'Выполнить команду редактора с параметрами. Диалогов нет: всё задаётся параметрами. '
                    . 'Многие команды действуют на выделение (рамки или текст) либо на рамки из ids. Действие отменяется (Ctrl+Z).',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'id' => ['type' => 'string', 'description' => 'id команды, например frame.create, selection.set, text.select, story.replaceRange, type.char, type.para, style.paragraph.create, layout.marginsAndColumns'],
                        'params' => ['type' => 'object', 'description' => 'Параметры команды (JSON-объект). Можно не передавать — тогда значения по умолчанию.'],
                    ],
                    'required' => ['id'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'add_text_frame',
                'description' => 'Поставить на страницу текстовую рамку с текстом. Координаты — в миллиметрах от левого верхнего угла страницы; '
                    . 'без них рамка встаёт по полям вверху страницы. Абзацы текста разделяй переводом строки. Возвращает id рамки и номер истории.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'page' => ['type' => 'integer', 'description' => 'Номер страницы с 1, по умолчанию 1'],
                        'x' => ['type' => 'number', 'description' => 'Левый край, мм'],
                        'y' => ['type' => 'number', 'description' => 'Верхний край, мм'],
                        'width' => ['type' => 'number', 'description' => 'Ширина, мм'],
                        'height' => ['type' => 'number', 'description' => 'Высота, мм'],
                        'text' => ['type' => 'string', 'description' => 'Текст рамки'],
                        'paragraphStyle' => ['type' => 'string', 'description' => 'Стиль абзаца для всего текста (имя из get_state), необязательно'],
                    ],
                    'required' => ['text'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'undo',
                'description' => 'Отменить последние действия (как Ctrl+Z).',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'steps' => ['type' => 'integer', 'description' => 'Сколько шагов отменить, по умолчанию 1', 'minimum' => 1, 'maximum' => 20],
                    ],
                ],
            ],
        ],
    ];
}

/** Системная инструкция. $mode: 'advice' (Совет) или 'act' (Сделай). */
function studio_system_prompt(string $mode): string
{
    $available = $mode === 'act' ? array_merge(studio_read_tools(), studio_act_tools()) : studio_read_tools();
    $catalog = studio_tool_catalog($available);

    $common = <<<TXT
Ты — встроенный помощник AI-InDesign, программы вёрстки, устроенной как Adobe InDesign: меню Файл, Редактирование, Макет,
Текст, Объект, Таблица, Просмотр, Окно; панели Страницы, Слои, Стили абзацев и символов, Образцы, Свойства; инструменты
Выделение, Текст, Рамка, Прямоугольник. Публикация состоит из страниц (разворотов); на страницах — рамки: текстовые,
графические и фигуры. Текст живёт в историях: история может перетекать по нескольким связанным рамкам.
Публикации — .designcraft (родной формат), открываются также .idml, .indd и .indt; файлы пользователя хранятся на
его сервере («Мои публикации»). Интерфейс на русском. Пользователь работает в редакторе прямо сейчас. К его сообщению
приложено состояние публикации, а иногда снимок экрана.

Как отвечать:
- Всегда по-русски, коротко и по делу: 1–6 предложений или короткий нумерованный список шагов.
- Пункты меню пиши так: «Макет › Поля и колонки». Горячие клавиши — в скобках: (Ctrl+D). Сочетания — как в InDesign.
- Названия команд бери из find_commands, а не по памяти. Не выдумывай функций, которых нет.
- Размеры: в get_state — миллиметры; в командах (frame.create, layout.marginsAndColumns, type.char, type.para…) — пункты:
  1 мм = 2,835 пт, 1 см = 28,35 пт. Координаты frame.create — пункты в системе разворота: страница начинается с её
  левого края (x страницы из document.inspect), y = 0 — верх страницы. Проще ставить рамки инструментом add_text_frame (в мм).
- Сохранение: Ctrl+S сохраняет публикацию в «Мои публикации» на сервере (значок папки в панели помощника).

Твои инструменты (других нет — ни computer_use, ни кликов по координатам):
{$catalog}
Вызывай их штатно. Если штатный вызов недоступен, напиши вызов текстом, по одному блоку на вызов:
<tool_call><function=ИМЯ><parameter=КЛЮЧ>ЗНАЧЕНИЕ</parameter></function></tool_call>
Значения-объекты и списки пиши в JSON. После блока ничего не пиши — дождись результата.
TXT;

    if ($mode === 'act') {
        return $common . "\n\n" . <<<TXT
Режим «Сделай»: ты сам правишь публикацию с помощью инструментов.
Это главное правило: не объясняй пользователю, как сделать вручную, — сделай сам. Если раньше в разговоре
ты был в режиме «Совет» и писал, что не можешь ничего менять, — это больше не так: сейчас режим «Сделай».
Каждое сообщение пользователя начинается с пометки текущего режима — верь ей.
Порядок работы:
1. Пойми задачу. Если она неоднозначна и ошибка дорого стоит — задай один уточняющий вопрос.
2. Посмотри публикацию: состояние приложено к сообщению; текст — read_text; рамка подробно — frame_details.
3. Действуй командами (run_command) и add_text_frame:
   - рамки: add_text_frame {page, x, y, width, height (мм), text, paragraphStyle?};
     frame.create {spread, rect: [x0,y0,x1,y1] (пт, координаты разворота), content: "text"|"graphic"|"unassigned", shape?: "rectangle"|"ellipse", text?};
   - выделить рамки: selection.set {ids: [id]}; переместить: transform.move {dx, dy (пт), ids}; размер и место: transform.set {x, y, width, height, ids};
     удалить: edit.clear {ids};
   - текст: story.replaceRange {story, start, end, text} (байтовые смещения UTF-8; весь текст истории — start 0, end = длина в байтах),
     или выделить text.select {story, anchor, focus} и печатать text.insert {text}; найти и заменить: find.change {find, change};
   - оформление выделенного текста: type.char {attrs: {fontFamily, fontStyle, size, leading: {"kind":"points","value":14}, tracking, fill}};
     type.para {attrs: {align: "left|center|right|justify", leftIndent, firstLineIndent, spaceBefore, spaceAfter (пт)}};
   - стили: style.paragraph.create {name, basedOn?, para: {...как type.para}, chars: {...как type.char}}; style.paragraph.edit {name, para?, chars?};
     применить к выделенному тексту: style.paragraph.apply {name}; style.character.apply {name};
   - рамка текста: object.textFrameOptions {columns, gutter, inset, verticalJustification, ids}; связать рамки: text.thread {from, to};
   - цвет: swatch.create {name, color: "#rrggbb" | {c,m,y,k}}; заливка и обводка: object.fill {swatch, ids}, object.stroke {swatch, weight, ids};
     цвет текста — type.char {attrs: {fill: "Имя образца"}};
   - страницы: layout.pages.insert {count, after?} (с 0); layout.pages.delete {pages: [с 0]}; поля и колонки: layout.marginsAndColumns {margins (пт), columns, gutter};
     размер страниц: layout.documentSetup {width, height, facingPages, margins, bleed}.
   Если не знаешь id команды или её параметры — find_commands. Многие команды без ids действуют на выделение.
4. После заметных изменений проверь результат (get_state или look_at_screen): текст не должен «вываливаться» (overset),
   рамки — налезать друг на друга без нужды. Коротко скажи, что сделал и как отменить (Ctrl+Z).
Правила безопасности:
- Не создавай новую публикацию, не открывай и не закрывай файлы, не удаляй страницы и большие куски текста, если пользователь прямо об этом не просил.
- Доводи задачу до конца сам, не останавливайся спросить «продолжать ли?»: число шагов ограничивает панель, а не ты.
  Если панель остановит тебя, пользователь нажмёт «Продолжить» — продолжай с того места, где остановился.
- После каждой серии действий приходит сообщение «[Состояние после этих шагов — автоматически]» (иногда со снимком экрана).
  Сверяйся с ним: что уже сделано, что осталось. Не повторяй то, что уже есть. Если инструмент вернул warning
  о повторе — остановись, посмотри на результат (get_state или look_at_screen) и делай следующую часть задачи.
- Если просят переделать или сделать лучше — сначала посмотри, что уже есть (get_state, look_at_screen), реши, что убрать,
  а что поправить, и только потом действуй. Не начинай с нуля, если можно улучшить то, что есть.
- Удаление, замену во всей публикации и подобное панель может подтвердить у пользователя; если пользователь отказал — не повторяй это действие,
  а спроси, как поступить.
- Если команда вернула ошибку — не повторяй вслепую: прочитай ошибку и params_doc, поправь параметры или объясни, что мешает.
TXT;
    }

    return $common . "\n\n" . <<<TXT
Режим «Совет»: ты только объясняешь и подсказываешь, ничего не меняешь сам.
Можно искать команды (find_commands), читать публикацию (get_state, read_text, frame_details) и смотреть на экран (look_at_screen).
Объясняй, куда нажать и что выставить, с конкретными числами. Можешь пересказать публикацию, найти в ней нужное, проверить текст и вёрстку.
Если пользователь просит изменить публикацию за него — скажи, что для этого нужно переключиться в режим «Сделай» (кнопка вверху панели).
TXT;
}

/**
 * Каталог инструментов текстом — для системной подсказки. Некоторые шлюзы (например, vLLM без
 * парсера вызовов) не передают модели поле tools; тогда модель узнаёт о наших инструментах
 * только отсюда и пишет вызовы текстом.
 */
function studio_tool_catalog(array $tools): string
{
    $lines = [];
    foreach ($tools as $t) {
        $f = $t['function'] ?? [];
        $name = (string)($f['name'] ?? '');
        if ($name === '') {
            continue;
        }
        $params = [];
        foreach (($f['parameters']['properties'] ?? []) as $p => $spec) {
            $params[] = $p . ': ' . ($spec['type'] ?? 'string');
        }
        $lines[] = '- ' . $name . '(' . implode(', ', $params) . ') — ' . (string)($f['description'] ?? '');
    }
    return implode("\n", $lines);
}

/**
 * Вызовы инструментов, которые модель написала текстом, а не штатным полем tool_calls:
 *   <tool_call><function=ИМЯ><parameter=КЛЮЧ>ЗНАЧЕНИЕ</parameter>…</function></tool_call>  (Qwen)
 *   <tool_call>{"name": "ИМЯ", "arguments": {…}}</tool_call>                             (Hermes)
 * Возвращает [вызовы, текст без этих блоков].
 */
function studio_text_tool_calls(string $content): array
{
    $calls = [];
    $value = static function (string $raw) {
        $raw = trim($raw);
        $j = json_decode($raw, true);
        return ($j !== null || $raw === 'null') ? $j : $raw;
    };
    // Qwen XML: с обёрткой <tool_call> или без неё. Прокси с vLLM иногда «съедает» начало
    // вызова («<tool_call>\n<»), и приходит «function=run_command>…» — это тоже понимаем,
    // как и вызов без закрывающих тегов в конце ответа.
    if (preg_match_all('~(?:<tool_call>\s*)?<?function=([A-Za-z0-9_.\-]+)>(.*?)(?:</function>(?:\s*</tool_call>)?|(?=<?function=[A-Za-z0-9_.\-]+>)|\z)~s', $content, $m, PREG_SET_ORDER)) {
        foreach ($m as $one) {
            $args = [];
            if (preg_match_all('~<?parameter=([A-Za-z0-9_.\-]+)>(.*?)(?:</parameter>|(?=<?parameter=[A-Za-z0-9_.\-]+>)|(?=</function>)|\z)~s', $one[2], $pm, PREG_SET_ORDER)) {
                foreach ($pm as $p) {
                    $args[$p[1]] = $value($p[2]);
                }
            }
            $calls[] = ['function' => ['name' => $one[1], 'arguments' => $args ?: new stdClass()]];
            $content = str_replace($one[0], '', $content);
        }
    }
    // Hermes: JSON внутри <tool_call>.
    if (preg_match_all('~<tool_call>\s*(\{.*?\})\s*</tool_call>~s', $content, $m, PREG_SET_ORDER)) {
        foreach ($m as $one) {
            $j = json_decode($one[1], true);
            if (is_array($j) && isset($j['name'])) {
                $args = $j['arguments'] ?? ($j['parameters'] ?? []);
                if (is_string($args)) {
                    $args = json_decode($args, true) ?: [];
                }
                $calls[] = ['function' => ['name' => (string)$j['name'], 'arguments' => $args ?: new stdClass()]];
                $content = str_replace($one[0], '', $content);
            }
        }
    }
    // Рассуждения модели в ответ не нужны.
    $content = preg_replace('~<think>.*?</think>~s', '', $content) ?? $content;
    $content = trim(str_replace(['<tool_call>', '</tool_call>'], '', $content));
    return [$calls, $content];
}
