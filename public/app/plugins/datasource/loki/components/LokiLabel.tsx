import React, { forwardRef, HTMLAttributes } from 'react';
import { cx, css } from 'emotion';
import { GrafanaTheme } from '@grafana/data';
import { useTheme } from '@grafana/ui';
// @ts-ignore
import Highlighter from 'react-highlight-words';

/**
 * @public
 */
export type OnLabelClick = (name: string, value: string | undefined, event: React.MouseEvent<HTMLElement>) => any;

export interface Props extends Omit<HTMLAttributes<HTMLElement>, 'onClick'> {
  name: string;
  active: boolean;
  display?: string;
  loading?: boolean;
  searchTerm?: RegExp;
  value?: string;
  onClick?: OnLabelClick;
}

export const LokiLabel = forwardRef<HTMLElement, Props>(
  ({ name, value, display, onClick, className, loading, searchTerm, active, style, ...rest }, ref) => {
    const theme = useTheme();
    const styles = getLabelStyles(theme, name);

    const onLabelClick = (event: React.MouseEvent<HTMLElement>) => {
      if (onClick) {
        onClick(name, value, event);
      }
    };
    const text = display || name;

    return (
      <span
        key={text}
        ref={ref}
        onClick={onLabelClick}
        style={style}
        title={text}
        className={cx(
          styles.base,
          active && styles.active,
          loading && styles.loading,
          className,
          onClick && styles.hover
        )}
        {...rest}
      >
        <Highlighter textToHighlight={text} searchWords={[searchTerm]} highlightClassName={styles.matchHighLight} />
      </span>
    );
  }
);

const getLabelStyles = (theme: GrafanaTheme, name: string) => {
  const colors = ['#FF7368', '#459EE7'];

  return {
    base: css`
      cursor: pointer;
      font-size: ${theme.typography.size.sm};
      line-height: ${theme.typography.lineHeight.xs};
      border: 1px solid ${theme.palette.gray5};
      vertical-align: baseline;
      color: ${theme.palette.gray10};
      white-space: nowrap;
      text-shadow: none;
      padding: 3px 6px;
      border-radius: ${theme.border.radius.md};
      margin-right: ${theme.spacing.sm};
      margin-bottom: ${theme.spacing.xs};
      text-overflow: ellipsis;
      overflow: hidden;
    `,
    loading: css`
      font-weight: ${theme.typography.weight.semibold};
      background-color: ${colors[0]};
      color: ${theme.palette.gray98};
      animation: pulse 3s ease-out 0s infinite normal forwards;
      @keyframes pulse {
        0% {
          color: ${theme.palette.gray98};
        }
        50% {
          color: ${theme.palette.gray25};
        }
        100% {
          color: ${theme.palette.gray98};
        }
      }
    `,
    active: css`
      font-weight: ${theme.typography.weight.semibold};
      background-color: ${colors[1]};
      color: ${theme.palette.gray98};
    `,
    matchHighLight: css`
      background: inherit;
      color: ${theme.palette.yellow};
      background-color: rgba(${theme.palette.yellow}, 0.1);
    `,
    hover: css`
      &:hover {
        opacity: 0.85;
        cursor: pointer;
      }
    `,
  };
};
