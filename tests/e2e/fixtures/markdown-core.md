# Heading one
## Heading two
### Heading three
#### Heading four
##### Heading five
###### Heading six

Setext heading
==============

**Bold with _nested italic_ and normal bold**; *italic*; __bold__; ~~deleted~~; ==highlight==.

Inline ``code with `backticks` inside``. Escaped \*literal\* and &amp; &#169; entities.

> Quoted **bold text**
> > Nested quote
> - Nested bullet

3. Numbered item
4. Second item
   - Nested item

- [ ] Task to do
- [x] Completed task
+ Plus bullet

~~~javascript
const value = 42;
// **not bold**
~~~

    Indented code

[Example](https://example.com "Title") <https://example.com> https://example.com

[Reference][ref] and [Heading](#heading-one)

[ref]: https://example.com "A reference"

First footnote[^first].

| Name | Value | Status |
| :--- | ---: | :---: |
| **Alpha** | 42 | Ready[^table] |
| Escaped \| pipe | `code` | $x^2$ |
| Line<br>break | _Italic_ | ==Highlighted== |

Final footnote[^last] and inline math $e^{i\pi} + 1 = 0$.

[^first]: First note with **formatting**.
[^table]: A table reference shares the document's numbering.
[^last]: Final note.

$$
\begin{bmatrix} a & b \\ c & d \end{bmatrix}
$$

***

Water H<sub>2</sub>O and x<sup>2</sup>, with <kbd>Ctrl</kbd>.

<div><strong>Safe HTML block</strong></div>

After the rule.
