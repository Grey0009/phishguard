"""URL lexical graph.

Every URL is turned into a small undirected graph:

  root --- scheme
  root --- suffix --- sld --- sub(inner) --- sub(outer)      (host hierarchy)
  root --- path/0 --- path/1 --- ...                          (path chain)
  root --- query-key
  <label node> --- token nodes      (token nodes are SHARED by text)
  token_i --- token_{i+1}           (adjacency inside one label, e.g. secure-paypal-login)

Because token nodes are shared, the same word appearing in two places (e.g.
`paypal` as a sub-domain AND in the path) creates a cycle.  Graph measures
such as the shortest distance from the registrable-domain node to a *brand*
token, or whether a *keyword* token sits next to a brand token, are strong
signals that are hard to see in a flat bag of characters.
"""
from __future__ import annotations

from collections import deque
from typing import Dict, Iterable, List, Set

from .netutil import ParsedURL, shannon_entropy, tokenize


class UrlGraph:
    def __init__(self) -> None:
        self.adj: Dict[str, Set[str]] = {}
        self.kind: Dict[str, str] = {}
        self.label: Dict[str, str] = {}

    def add_node(self, nid: str, kind: str, label: str = "") -> None:
        if nid not in self.adj:
            self.adj[nid] = set()
            self.kind[nid] = kind
            self.label[nid] = label or nid.split(":")[-1]

    def add_edge(self, a: str, b: str) -> None:
        if a != b:
            self.adj[a].add(b)
            self.adj[b].add(a)

    @property
    def n_nodes(self) -> int:
        return len(self.adj)

    @property
    def n_edges(self) -> int:
        return sum(len(v) for v in self.adj.values()) // 2

    def bfs(self, src: str) -> Dict[str, int]:
        dist = {src: 0}
        dq = deque([src])
        while dq:
            u = dq.popleft()
            for v in self.adj[u]:
                if v not in dist:
                    dist[v] = dist[u] + 1
                    dq.append(v)
        return dist

    def to_dict(self) -> dict:
        edges = sorted({tuple(sorted((a, b))) for a, nbrs in self.adj.items() for b in nbrs})
        return {
            "nodes": [{"id": n, "kind": self.kind[n], "label": self.label[n]} for n in self.adj],
            "edges": [list(e) for e in edges],
        }


def build_url_graph(p: ParsedURL) -> UrlGraph:
    g = UrlGraph()
    g.add_node("root", "url", "URL")
    g.add_node("scheme:" + p.scheme, "scheme", p.scheme)
    g.add_edge("root", "scheme:" + p.scheme)

    def attach_tokens(label_node: str, text: str) -> None:
        prev = None
        for t in tokenize(text):
            tn = "tok:" + t
            g.add_node(tn, "token", t)
            g.add_edge(label_node, tn)
            if prev:
                g.add_edge(prev, tn)
            prev = tn

    # --- host hierarchy
    sld_node = "sld:" + (p.sld or p.host)
    if p.suffix:
        g.add_node("suffix:" + p.suffix, "suffix", p.suffix)
        g.add_edge("root", "suffix:" + p.suffix)
        g.add_node(sld_node, "sld", p.sld)
        g.add_edge("suffix:" + p.suffix, sld_node)
    else:
        g.add_node(sld_node, "sld", p.sld or p.host)
        g.add_edge("root", sld_node)
    if not p.is_ip:
        attach_tokens(sld_node, p.sld)
    prev = sld_node
    for i, lab in enumerate(reversed(p.sub_labels)):       # inner label first
        nid = f"sub:{i}:{lab}"
        g.add_node(nid, "subdomain", lab)
        g.add_edge(prev, nid)
        prev = nid
        attach_tokens(nid, lab)

    # --- path chain
    prev = "root"
    for i, seg in enumerate([s for s in p.path.split("/") if s][:12]):
        nid = f"path:{i}:{seg[:40]}"
        g.add_node(nid, "path", seg[:40])
        g.add_edge(prev, nid)
        prev = nid
        attach_tokens(nid, seg)

    # --- query keys
    if p.query:
        for pair in p.query.split("&")[:12]:
            key = pair.split("=", 1)[0]
            if key:
                nid = "q:" + key[:30]
                g.add_node(nid, "query", key[:30])
                g.add_edge("root", nid)
                attach_tokens(nid, key)
    return g


def graph_features(g: UrlGraph, p: ParsedURL, keyword_tokens: Iterable[str],
                   brand_tokens: Iterable[str]) -> Dict[str, float]:
    kw = set(keyword_tokens)
    br = set(brand_tokens)
    tok_nodes = [n for n, k in g.kind.items() if k == "token"]
    tok_text = [g.label[n] for n in tok_nodes]
    degrees = [len(v) for v in g.adj.values()]
    n, e = g.n_nodes, g.n_edges
    sld_node = next((x for x, k in g.kind.items() if k == "sld"), "root")
    d_root = g.bfs("root")
    d_sld = g.bfs(sld_node)
    brand_nodes = [x for x in tok_nodes if g.label[x] in br]
    kw_nodes = [x for x in tok_nodes if g.label[x] in kw]
    brand_dist = min((d_sld[b] for b in brand_nodes if b in d_sld), default=9)
    adjacent = sum(1 for k in kw_nodes for b in brand_nodes if b in g.adj[k])
    rand = sum(1 for t in tok_text if len(t) >= 10 and shannon_entropy(t) >= 3.2)
    ent = (sum(shannon_entropy(t) for t in tok_text) / len(tok_text)) if tok_text else 0.0
    return {
        "g_nodes": float(n),
        "g_edges": float(e),
        "g_density": (2.0 * e / (n * (n - 1))) if n > 1 else 0.0,
        "g_max_degree": float(max(degrees)) if degrees else 0.0,
        "g_avg_degree": (sum(degrees) / n) if n else 0.0,
        "g_depth": float(max(d_root.values())) if d_root else 0.0,
        "g_cycles": float(e - n + 1),            # cyclomatic number (graph is connected via root)
        "g_tokens": float(len(tok_nodes)),
        "g_kw_tokens": float(len(kw_nodes)),
        "g_brand_tokens": float(len(brand_nodes)),
        "g_brand_dist": float(brand_dist),
        "g_kw_brand_adjacent": float(adjacent),
        "g_random_tokens": float(rand),
        "g_token_entropy_mean": ent,
    }
