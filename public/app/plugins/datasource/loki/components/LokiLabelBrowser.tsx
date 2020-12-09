import React, { Component, createRef, ChangeEvent } from 'react';
import {
  Button,
  HorizontalGroup,
  Input,
  Label,
  LoadingPlaceholder,
  Popover,
  PopoverController,
  stylesFactory,
  withTheme,
} from '@grafana/ui';
import LokiLanguageProvider from '../language_provider';
import { css } from 'emotion';
import store from 'app/core/store';
import { FixedSizeList } from 'react-window';

import { GrafanaTheme } from '@grafana/data';
import { LokiLabel } from './LokiLabel';

const EMPTY_SELECTOR = '{}';
export const LAST_USED_LABELS_KEY = 'grafana.datasources.loki.browser.labels';

type onChange = (selector: string) => any;

interface Props {
  buttonClass: string;
  buttonText: string;
  disabled: boolean;
  languageProvider: LokiLanguageProvider;
  theme: GrafanaTheme;
  onChange: onChange;
}

interface BrowserProps {
  languageProvider: LokiLanguageProvider;
  onChange: onChange;
  theme: GrafanaTheme;
}

interface BrowserState {
  labels: SelectableLabel[];
  searchTerm: string;
}

interface FacettableValue {
  name: string;
  hidden?: boolean;
}

interface SelectableLabel {
  name: string;
  selected: boolean;
  loading: boolean;
  values?: FacettableValue[];
  value?: string;
  hidden?: boolean;
}

const buildSelector = (labels: SelectableLabel[]) =>
  [
    '{',
    labels
      .reduce((acc, label) => {
        if (label.value) {
          acc.push(`${label.name}="${label.value}"`);
        }
        return acc;
      }, [] as string[])
      .join(','),
    '}',
  ].join('');

const getStyles = stylesFactory((theme: GrafanaTheme) => {
  const { white, black, dark1, dark2, dark7, gray1, gray3, gray5, gray7 } = theme.palette;
  const lightThemeStyles = {
    linkColor: dark2,
    linkColorHover: theme.colors.link,
    wrapperBg: gray7,
    wrapperShadow: gray3,
    itemColor: black,
    groupLabelColor: gray1,
    itemBgHover: gray5,
    headerBg: white,
    headerSeparator: white,
  };
  const darkThemeStyles = {
    linkColor: theme.colors.text,
    linkColorHover: white,
    wrapperBg: dark2,
    wrapperShadow: black,
    itemColor: white,
    groupLabelColor: theme.colors.textWeak,
    itemBgHover: dark7,
    headerBg: dark1,
    headerSeparator: dark7,
  };

  const styles = theme.isDark ? darkThemeStyles : lightThemeStyles;

  return {
    header: css`
      padding: 4px;
      border-bottom: 1px solid ${styles.headerSeparator};
      background: ${styles.headerBg};
      margin-bottom: ${theme.spacing.xs};
      border-radius: ${theme.border.radius.sm} ${theme.border.radius.sm} 0 0;
    `,
    wrapper: css`
      z-index: 1040;
      max-width: 50rem;
    `,
    popover: css`
      color: ${styles.itemColor};
      background: ${styles.wrapperBg};
      z-index: 1;
      box-shadow: 0 2px 5px 0 ${styles.wrapperShadow};
      min-width: 200px;
      display: inline-block;
      border-radius: ${theme.border.radius.sm};
      padding: ${theme.spacing.sm};
    `,
    list: css`
      margin-top: ${theme.spacing.sm};
      display: flex;
      flex-wrap: wrap;
    `,
    filterListRow: css`
      label: filterListRow;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: ${theme.spacing.xs};
      :hover {
        background-color: ${theme.colors.bg3};
      }
    `,
    section: css`
      & + & {
        margin: ${theme.spacing.md} 0;
      }
    `,
    selector: css`
      font-family: ${theme.typography.fontFamily.monospace};
      margin-bottom: ${theme.spacing.sm};
    `,
    valueCell: css`
      overflow: hidden;
      text-overflow: ellipsis;
    `,
    valueList: css`
      margin-right: ${theme.spacing.sm};
    `,
    valueListWrapper: css`
      display: flex;
      flex-direction: row;
      margin-top: ${theme.spacing.sm};
    `,
  };
});

class LokiLabelBrowserPopover extends React.Component<BrowserProps, BrowserState> {
  state = {
    labels: [] as SelectableLabel[],
    searchTerm: '',
  };

  onChangeSearch = (event: ChangeEvent<HTMLInputElement>) => {
    this.setState({ searchTerm: event.target.value });
  };

  onClickAccept = () => {
    const selector = buildSelector(this.state.labels);
    this.props.onChange(selector);
  };

  onClickClear = () => {
    this.setState(state => {
      const labels: SelectableLabel[] = state.labels.map(label => ({
        ...label,
        value: undefined,
        values: undefined,
        selected: false,
        loading: false,
        hidden: false,
      }));
      return { labels, searchTerm: '' };
    });
    store.delete(LAST_USED_LABELS_KEY);
  };

  onClickLabel = (name: string, value: string | undefined, event: React.MouseEvent<HTMLElement>) => {
    const selected = !this.state.labels.find(l => l.name === name)?.selected;
    const nextValue = selected ? { selected } : { selected, value: undefined };
    if (selected) {
      this.fetchValues(name);
    }
    this.updateLabelState(name, nextValue, () => {
      const selectedLabels = this.state.labels.filter(label => label.selected).map(label => label.name);
      store.setObject(LAST_USED_LABELS_KEY, selectedLabels);
    });
  };

  onClickValue = (name: string, value: string | undefined, event: React.MouseEvent<HTMLElement>) => {
    const active = this.state.labels.find(l => l.name === name && l.value === value);
    if (!active) {
      this.updateLabelState(name, { value }, this.doFacetting);
    } else {
      this.updateLabelState(name, { value: undefined }, this.doFacetting);
    }
  };

  updateLabelState(name: string, updatedFields: Partial<SelectableLabel>, cb?: () => void) {
    this.setState(state => {
      const labels: SelectableLabel[] = state.labels.map(label => {
        if (label.name === name) {
          return { ...label, ...updatedFields };
        }
        return label;
      });
      return { labels };
    }, cb);
  }

  componentDidMount() {
    const { languageProvider } = this.props;
    if (languageProvider) {
      const selectedLabels: string[] = store.getObject(LAST_USED_LABELS_KEY, []);
      languageProvider.start().then(() => {
        const labels: SelectableLabel[] = languageProvider
          .getLabelKeys()
          .map(label => ({ name: label, selected: selectedLabels.includes(label), loading: false }));
        this.setState({ labels }, () => {
          this.state.labels.forEach(label => {
            if (label.selected) {
              this.fetchValues(label.name);
            }
          });
        });
      });
    }
  }

  doFacetting = () => {
    const selector = buildSelector(this.state.labels);
    if (selector === EMPTY_SELECTOR) {
      // Clear up facetting
      const labels: SelectableLabel[] = this.state.labels.map(label => {
        const values = label.values?.map(value => ({
          ...value,
          hidden: false,
        }));
        return { ...label, values, hidden: false };
      });
      this.setState({ labels }, () => {
        // Get fresh set of values
        this.state.labels.forEach(label => label.selected && this.fetchValues(label.name));
      });
    } else {
      // Do facetting
      this.fetchSeries(selector);
    }
  };

  async fetchValues(name: string) {
    const { languageProvider } = this.props;
    this.updateLabelState(name, { loading: true });
    const selector = buildSelector(this.state.labels);
    if (selector === EMPTY_SELECTOR) {
      try {
        const values: FacettableValue[] = (await languageProvider.getLabelValues(name)).map(value => ({ name: value }));
        this.updateLabelState(name, { values, loading: false });
      } catch (error) {
        console.error(error);
      }
    } else {
      this.fetchSeries(selector);
    }
  }

  async fetchSeries(name: string) {
    const { languageProvider } = this.props;
    // this.updateLabelState(name, { loading: true });
    try {
      const possibleLabels = await languageProvider.fetchSeriesLabels(name);
      const labels: SelectableLabel[] = this.state.labels.map(label => {
        const possibleValues = possibleLabels[label.name];
        if (possibleValues) {
          let existingValues;
          if (label.values) {
            existingValues = label.values.map(value => ({
              ...value,
              hidden: !possibleValues.includes(value.name),
            }));
          } else {
            existingValues = possibleValues.map(value => ({ name: value, hidden: false }));
          }
          return { ...label, loading: false, values: existingValues };
        }
        // Label is facetted out
        return { ...label, loading: false, hidden: !possibleValues };
      });
      this.setState({ labels });
    } catch (error) {
      console.error(error);
    }
  }

  render() {
    const { theme } = this.props;
    const { labels, searchTerm } = this.state;
    if (labels.length === 0) {
      return <LoadingPlaceholder text="Loading labels..." />;
    }
    const styles = getStyles(theme);
    let matcher: RegExp;
    let rowCount = 0;
    const values = labels.reduce((acc, label) => {
      if (label.selected && label.values && !label.hidden) {
        let values = label.values
          .filter(value => !value.hidden)
          .map(value => ({
            display: `${label.name}="${value.name}"`,
            label: label.name,
            value: value.name,
            selected: label.value ? label.value === value.name : false,
          }));
        if (searchTerm) {
          try {
            matcher = new RegExp(searchTerm.split('').join('.*'), 'i');
            values = values.filter(value => value.selected || matcher.test(value.display));
          } catch (error) {}
        }
        rowCount = Math.max(rowCount, values.length);
        return [...acc, values];
      } else {
        return acc;
      }
    }, []);
    const selector = buildSelector(this.state.labels);
    const empty = selector === EMPTY_SELECTOR;
    return (
      <>
        <div className={styles.section}>
          <Label description="Which labels would you like to consider for your search?">
            1. Select labels to search in
          </Label>
          <div className={styles.list}>
            {labels.map(label => (
              <LokiLabel
                key={label.name}
                name={label.name}
                loading={label.loading}
                active={label.selected}
                hidden={label.hidden}
                onClick={this.onClickLabel}
              />
            ))}
          </div>
        </div>
        <div className={styles.section}>
          <Label description="Choose the label values that you would like to use for the query.">
            2. Find values for the selected labels
          </Label>
          <div>
            <Input onChange={this.onChangeSearch} value={searchTerm} />
          </div>
          <div className={styles.valueListWrapper}>
            {values.map((labelValues, i) => (
              <FixedSizeList
                key={i}
                height={200}
                itemCount={labelValues.length}
                itemSize={25}
                itemKey={i => labelValues[i].display}
                width={200}
                className={styles.valueList}
              >
                {({ index, style }) => {
                  const { display, value, selected, label } = labelValues[index];
                  return (
                    <div style={style} className={styles.valueCell}>
                      <LokiLabel
                        name={label}
                        value={value}
                        display={display}
                        active={selected}
                        onClick={this.onClickValue}
                        searchTerm={matcher}
                      />
                    </div>
                  );
                }}
              </FixedSizeList>
            ))}
          </div>
        </div>
        <div className={styles.section}>
          <Label>3. Resulting selector</Label>
          <div className={styles.selector}>{selector}</div>
          <HorizontalGroup>
            <Button aria-label="Selector submit button" disabled={empty} onClick={this.onClickAccept}>
              Use selector
            </Button>
            <Button aria-label="Selector clear button" variant="secondary" onClick={this.onClickClear}>
              Clear labels
            </Button>
          </HorizontalGroup>
        </div>
      </>
    );
  }
}

class UnthemedLokiLabelBrowser extends Component<Props, {}> {
  static displayName = 'LokiLabelBrowser';
  pickerTriggerRef = createRef<any>();

  render() {
    const { buttonClass, buttonText, disabled, languageProvider, onChange, theme } = this.props;
    const popoverElement = React.createElement(LokiLabelBrowserPopover, { languageProvider, theme, onChange });
    const styles = getStyles(theme);

    return (
      <PopoverController content={popoverElement} hideAfter={300}>
        {(showPopper, hidePopper, popperProps) => {
          return (
            <>
              {this.pickerTriggerRef.current && (
                <Popover
                  {...popperProps}
                  show
                  placement="bottom-end"
                  referenceElement={this.pickerTriggerRef.current}
                  wrapperClassName={styles.wrapper}
                  className={styles.popover}
                />
              )}
              <button disabled={disabled} ref={this.pickerTriggerRef} className={buttonClass} onClick={showPopper}>
                {buttonText}
              </button>
            </>
          );
        }}
      </PopoverController>
    );
  }
}

export const LokiLabelBrowser = withTheme(UnthemedLokiLabelBrowser);
