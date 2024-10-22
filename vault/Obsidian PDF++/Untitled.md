My Zotero Integration template looks like this (this is a simplified version; you can view the full version [here](https://gist.github.com/RyotaUshio/ca6eae6b830e11a71b8fa101d5f05d67)):

```
---
{% if attachments -%}
PDF:
{%- for attachment in attachments | filterby("title", "endswith", ".pdf")%}
  - "[[{{ attachment.title }}]]"
{%- endfor %}
{%- endif %}
shortAuthor: {% set n_authors = 0 -%}{%- for creator in creators -%}{%- if creator.creatorType == "author" -%}{%- set n_authors = n_authors + 1 -%}{%- endif -%}{%- endfor -%}{%- if n_authors == 1-%}{%- set authorString = creators[0].lastName -%}{%- elif n_authors == 2 -%}{%- set authorString = creators[0].lastName + " & " + creators[1].lastName -%}{%- else -%}{%- set authorString = creators[0].lastName + " et al." -%}{%- endif -%}"{{authorString}}"
formattedTitle: "{{title}} ({{authorString}}, {{date | format("YYYY")}})"
citet: "{{authorString}} ({{date | format("YYYY")}})"
citep: "({{authorString}}, {{date | format("YYYY")}})"
---

PDF: `dv:this.PDF`
```

Then, I modify the default "TItle & page" display text format like so

```
{{properties.citet ?? file.basename}}, p.{{pageLabel}}
```

