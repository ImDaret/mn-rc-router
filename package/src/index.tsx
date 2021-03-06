import React, {
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  forwardRef,
} from "react";
import { createBrowserHistory, createHashHistory } from "history";
import { match } from "path-to-regexp";

export type basicRoute = {
  path: string;
  el: React.ReactElement;
  child?: Route[];
};

export type BeforeEnter = (
  to: string,
  from: string,
  record: Partial<basicRoute>
) => boolean;

export type Route = basicRoute & {
  beforeEnter?: BeforeEnter | BeforeEnter[];
};

type metaRoute = Route & {
  meta?: Route[];
};

export type RouterProps = {
  mode?: "browser" | "hash";
  children?: React.ReactNode;
  routes: Route[];
};

export const LocationContext = React.createContext(null!);
export const HistoryContext = React.createContext(null!);
export const MatchContext = React.createContext(null!);
export const OutletContext = React.createContext<React.ReactElement | null>(
  null!
);

const flat = (routes: Route[]) => {
  const result: metaRoute[] = [];
  function deep(arr: metaRoute[], meta: Route[]) {
    arr.forEach((item) => {
      item.meta = [...meta, item];
      if (item.child) {
        result.push(item);
        deep(item.child, item.meta);
      } else {
        result.push(item);
      }
    });
  }

  deep(routes, []);
  return result;
};

const matchRoute = (branch: metaRoute[], pathname: string) => {
  let params = {};
  const target = branch.find((item) => {
    const fn = match(item.path, { decode: decodeURIComponent });
    const res = fn(pathname);
    if (res) {
      params = res.params;
      return true;
    }
  });
  return { targetRoute: target, params };
};

export const Router: React.FC<RouterProps> = ({ mode = "browser", routes }) => {
  const history = useMemo(
    () => (mode === "hash" ? createHashHistory() : createBrowserHistory()),
    []
  );

  const [location, setLocation] = useState(history.location);
  const [query, setQuery] = useState({});
  const pathname = useMemo(() => location.pathname, [location.pathname]);
  const branch = useMemo(() => flat(routes), [routes]);

  useLayoutEffect(() => {
    history.listen(({ location: _location }) => {
      const { targetRoute } = matchRoute(branch, _location.pathname);
      const { beforeEnter, ...rest } = targetRoute || {};
      if (beforeEnter) {
        const notLeave = !!(
          Array.isArray(beforeEnter) ? beforeEnter : [beforeEnter]
        )
          .map((func) => {
            return func(_location.pathname, pathname, rest);
          })
          .filter((item) => !item).length;
        if (notLeave) {
          history.replace(pathname);
          return;
        }
      }
      setLocation({
        ..._location,
        pathname: _location.pathname,
      });
    });
  }, [pathname, branch]);

  const matchEl = useMemo(() => {
    const { targetRoute, params } = matchRoute(branch, pathname);
    setQuery(params);
    return targetRoute.meta.reduceRight(
      (outlet: React.ReactElement, element) => {
        return (
          <OutletContext.Provider value={outlet}>
            {element.el !== undefined ? element.el : outlet}
          </OutletContext.Provider>
        );
      },
      null
    );
  }, [pathname, branch, matchRoute]);

  return (
    <HistoryContext.Provider value={history}>
      <LocationContext.Provider value={location}>
        <MatchContext.Provider value={query}>{matchEl}</MatchContext.Provider>
      </LocationContext.Provider>
    </HistoryContext.Provider>
  );
};

export const useRouter = () => {
  const history = useContext(HistoryContext);
  const match = useContext(MatchContext);
  const location = useContext(LocationContext);

  const searchParams = useMemo(() => {
    const searchs = location.search.slice(1).split("&");
    return searchs.reduce((obj: any, cur: string) => {
      const splitCur = cur.split("=");
      obj[splitCur[0]] = splitCur[1];
      return obj;
    }, {});
  }, [location.search]);

  return { ...history, match, searchParams };
};

export const Outlet = () => {
  const outlet = useContext(OutletContext);
  return outlet || null;
};

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  state?: any;
  replace?: boolean;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, state, replace = false, ...rest }, ref) => {
    const { push, replace: _replace } = useRouter();
    const handleClick = (
      e: React.MouseEvent<HTMLAnchorElement, MouseEvent>
    ) => {
      if (!e.defaultPrevented) {
        e.preventDefault();
        replace ? _replace(to) : push(to);
      }
    };
    return <a {...rest} href={to} onClick={handleClick} ref={ref} />;
  }
);
