/* This file is part of Tryton.  The COPYRIGHT file at the top level of
   this repository contains the full copyright notices and license terms. */
(function() {
    'use strict';

    Sao.ScreenContainer = Sao.class_(Object, {
        init: function(tab_domain) {
            this.alternate_viewport = jQuery('<div/>', {
                'class': 'screen-container'
            });
            this.alternate_view = false;
            this.tab_domain = tab_domain || [];
            this.el = jQuery('<div/>', {
                'class': 'screen-container'
            });
            this.filter_box = jQuery('<div/>', {
                'class': 'filter-box'
            });
            this.el.append(this.filter_box);
            this.filter_button = jQuery('<button/>').button({
                'disabled': true,
                'label': 'Filters' // TODO translation
            });
            this.filter_box.append(this.filter_button);
            this.search_entry = jQuery('<input/>');
            this.search_entry.keypress(function(e) {
                if (e.which == 13) {
                    this.do_search();
                    return false;
                }
            }.bind(this));
            this.filter_box.append(this.search_entry);
            this.but_bookmark = jQuery('<button/>').button({
                'disabled': true,
                'label': 'Bookmark' // TODO translation
            });
            this.filter_box.append(this.but_bookmark);
            this.but_prev = jQuery('<button/>').button({
                'label': 'Previous'
            });
            this.but_prev.click(this.search_prev.bind(this));
            this.filter_box.append(this.but_prev);
            this.but_next = jQuery('<button/>').button({
                'label': 'Next'
            });
            this.but_next.click(this.search_next.bind(this));
            this.filter_box.append(this.but_next);

            this.content_box = jQuery('<div/>', {
                'class': 'content-box'
            });

            if (!jQuery.isEmptyObject(this.tab_domain)) {
                this.tab = jQuery('<div/>', {
                    'class': 'tab-domain'
                }).append(jQuery('<div/>').append(jQuery('<ul/>')));
                this.tab.tabs();
                this.tab_domain.forEach(function(tab_domain, i) {
                    var name = tab_domain[0];
                    this.tab.tabs('add', '#' + i, name);
                }.bind(this));
                this.tab.find('#0').append(this.content_box);
                this.tab.tabs('select', '#0');
                this.tab.tabs({
                    'activate': this.switch_page.bind(this)
                });
                this.el.append(this.tab);
            } else {
                this.tab = null;
                this.el.append(this.content_box);
            }
        },
        set_text: function(value) {
            this.search_entry.val(value);
        },
        search_prev: function() {
            this.screen.search_prev(this.search_entry.val());
        },
        search_next: function() {
            this.screen.search_next(this.search_entry.val());
        },
        switch_page: function(event, ui) {
            ui.newPanel.append(ui.oldPanel.children().detach());
            this.do_search();
        },
        get_tab_domain: function() {
            if (!this.tab) {
                return [];
            }
            return this.tab_domain[this.tab.tabs('option', 'active')][1];
        },
        do_search: function() {
            this.screen.search_filter(this.search_entry.val());
        },
        set_screen: function(screen) {
            this.screen = screen;
        },
        show_filter: function() {
            this.filter_box.show();
            if (this.tab) {
                this.tab.show();
                this.content_box.detach();
                this.tab.find('#' + this.tab.tabs('option', 'active'))
                    .append(this.content_box);
            }
        },
        hide_filter: function() {
            this.filter_box.hide();
            if (this.tab) {
                this.tab.hide();
                this.content_box.detach();
                this.el.append(this.content_box);
            }
        },
        set: function(widget) {
            if (this.alternate_view) {
                this.alternate_viewport.children().detach();
                // TODO test if widget is content_box widget
                this.alternate_viewport.append(widget);
            } else {
                this.content_box.children().detach();
                this.content_box.append(widget);
            }
        }
    });

    Sao.Screen = Sao.class_(Object, {
        init: function(model_name, attributes) {
            this.model_name = model_name;
            this.model = new Sao.Model(model_name, attributes);
            this.attributes = jQuery.extend({}, attributes);
            this.attributes.limit = this.attributes.limit || Sao.config.limit;
            this.view_ids = jQuery.extend([], attributes.view_ids);
            this.view_to_load = jQuery.extend([],
                attributes.mode || ['tree', 'form']);
            this.views = [];
            this.exclude_field = attributes.exclude_field;
            this.context = attributes.context || {};
            this.new_group();
            this.current_view = null;
            this.current_record = null;
            this.limit = attributes.limit || 80;
            this.offset = 0;
            this.search_count = 0;
            this.screen_container = new Sao.ScreenContainer(
                attributes.tab_domain);
            this.parent = null;
            if (!attributes.row_activate) {
                this.row_activate = this.default_row_activate;
            } else {
                this.row_activate = attributes.row_activate;
            }
            this.fields_view_tree = null;
            this.domain_parser = null;
        },
        load_next_view: function() {
            if (!jQuery.isEmptyObject(this.view_to_load)) {
                var view_id;
                if (!jQuery.isEmptyObject(this.view_ids)) {
                    view_id = this.view_ids.shift();
                }
                var view_type = this.view_to_load.shift();
                return this.add_view_id(view_id, view_type);
            }
            return jQuery.when();
        },
        add_view_id: function(view_id, view_type) {
            // TODO preload
            var prm = this.model.execute('fields_view_get',
                    [view_id, view_type], this.context);
            return prm.pipe(this.add_view.bind(this));
        },
        add_view: function(view) {
            var arch = view.arch;
            var fields = view.fields;
            var xml_view = jQuery(jQuery.parseXML(arch));

            if (xml_view.children().prop('tagName') == 'tree') {
                this.fields_view_tree = view;
            }

            var loading = 'eager';
            if (xml_view.children().prop('tagName') == 'form') {
                loading = 'lazy';
            }
            for (var field in fields) {
                if (!(field in this.model.fields) || loading == 'eager') {
                    fields[field].loading = loading;
                } else {
                    fields[field].loading = this.model.fields[field]
                        .description.loading;
                }
            }
            this.model.add_fields(fields);
            var view_widget = Sao.View.parse(this, xml_view, view.field_childs);
            this.views.push(view_widget);

            return view_widget;
        },
        number_of_views: function() {
            return this.views.length + this.view_to_load.length;
        },
        switch_view: function(view_type) {
            // TODO check validity
            if ((!view_type) || (!this.current_view) ||
                    (this.current_view.view_type != view_type)) {
                var switch_current_view = (function() {
                    this.current_view = this.views[this.views.length - 1];
                    return this.switch_view(view_type);
                }.bind(this));
                for (var i = 0; i < this.number_of_views(); i++) {
                    if (this.view_to_load.length) {
                        if (!view_type) {
                            view_type = this.view_to_load[0];
                        }
                        return this.load_next_view().pipe(switch_current_view);
                    }
                    this.current_view = this.views[
                        (this.views.indexOf(this.current_view) + 1) %
                        this.views.length];
                    if (!view_type) {
                        break;
                    } else if (this.current_view.view_type == view_type) {
                        break;
                    }
                }
            }
            this.screen_container.set(this.current_view.el);
            this.display();
            // TODO cursor
            return jQuery.when();
        },
        search_filter: function(search_string) {
            var domain = [];

            if (this.domain_parser && !this.parent) {
                if (search_string || search_string === '') {
                    domain = this.domain_parser.parse(search_string);
                } else {
                    domain = this.attributes.search_value;
                }
                this.screen_container.set_text(
                        this.domain_parser.string(domain));
            } else {
                domain = [['id', 'in', this.group.map(function(r) {
                    return r.id;
                })]];
            }

            if (!jQuery.isEmptyObject(domain) && this.attributes.domain) {
                domain = ['AND', domain, this.attributes.domain];
            } else
                domain = this.attributes.domain || [];

            var tab_domain = this.screen_container.get_tab_domain();
            if (!jQuery.isEmptyObject(tab_domain)) {
                domain = ['AND', domain, tab_domain];
            }

            var grp_prm = this.model.find(domain, this.offset, this.limit,
                    this.attributes.order, this.context);
            var count_prm = this.model.execute('search_count', [domain],
                    this.context);
            count_prm.done(function(count) {
                this.search_count = count;
            }.bind(this));
            grp_prm.done(this.set_group.bind(this));
            grp_prm.done(this.display.bind(this));
            jQuery.when(grp_prm, count_prm).done(function(group, count) {
                this.screen_container.but_next.button('option', 'disabled',
                    !(group.length == this.limit &&
                        count > this.limit + this.offset));
            }.bind(this));
            this.screen_container.but_prev.button('option', 'disabled',
                    this.offset <= 0);
            return grp_prm;
        },
        set_group: function(group) {
            if (this.group) {
                jQuery.extend(group.model.fields, this.group.model.fields);
                this.group.screens.splice(
                        this.group.screens.indexOf(this), 1);
            }
            group.screens.push(this);
            this.group = group;
            this.model = group.model;
            if (jQuery.isEmptyObject(group)) {
                this.current_record = null;
            } else {
                this.current_record = group[0];
            }
        },
        new_group: function(ids) {
            var group = new Sao.Group(this.model, this.context, []);
            if (ids) {
                group.load(ids);
            }
            this.set_group(group);
        },
        display: function() {
            if (this.views) {
                this.search_active(['tree', 'graph', 'calendar'].indexOf(
                            this.current_view.view_type) > -1);
                for (var i = 0; i < this.views.length; i++) {
                    if (this.views[i]) {
                        this.views[i].display();
                    }
                }
            }
        },
        display_next: function() {
            // TODO
        },
        display_previous: function() {
            // TODO
        },
        default_row_activate: function() {
            if ((this.current_view.view_type == 'tree') &&
                    this.current_view.keyword_open) {
                Sao.Action.exec_keyword('tree_open', {
                    'model': this.model_name,
                    'id': this.get_id(),
                    'ids': [this.get_id()]
                    }, jQuery.extend({}, this.context));
            } else {
                this.switch_view('form');
            }
        },
        get_id: function() {
            if (this.current_record) {
                return this.current_record.id;
            }
        },
        new_: function(default_) {
            if (default_ === undefined) {
                default_ = true;
            }
            var prm = jQuery.when();
            if (this.current_view &&
                    ((this.current_view.view_type == 'tree' &&
                      !this.current_view.editable) ||
                     this.current_view.view_type == 'graph')) {
                prm = this.switch_view('form');
            }
            prm.done(function() {
                var group;
                if (this.current_record) {
                    group = this.current_record.group;
                } else {
                    group = this.group;
                }
                var record = group.new_(default_);
                group.add(record, this.new_model_position());
                this.current_record = record;
                this.display();
                // TODO set_cursor
            }.bind(this));
        },
        new_model_position: function() {
            var position = -1;
            // TODO editable
            return position;
        },
        cancel_current: function() {
            var prms = [];
            if (this.current_record) {
                this.current_record.cancel();
                if (this.current_record.id < 0) {
                    prms.push(this.remove());
                }
            }
            return jQuery.when.apply(jQuery, prms);
        },
        save_current: function() {
            if (!this.current_record) {
                if ((this.current_view.view_type == 'tree') &&
                        (!jQuery.isEmptyObject(this.group))) {
                    this.current_record = this.group[0];
                } else {
                    return true;
                }
            }
            this.current_view.set_value();
            var fields = this.current_view.get_fields();
            // TODO path
            var prm = jQuery.Deferred();
            if (this.current_view.view_type == 'tree') {
                prm = this.group.save();
            } else {
                this.current_record.validate(fields).then(function(validate) {
                    if (validate) {
                        this.current_record.save().then(
                            prm.resolve, prm.reject);
                    } else {
                        // TODO set_cursor
                        this.current_view.display();
                        prm.reject();
                    }
                }.bind(this));
            }
            prm.always(function() {
                this.display();
            }.bind(this));
            return prm;
        },
        modified: function() {
            var test = function(record) {
                return (record.has_changed() || record.id < 0);
            };
            if (this.current_view.view_type != 'tree') {
                if (this.current_record) {
                    if (test(this.current_record)) {
                        return true;
                    }
                }
            } else {
                if (this.group.some(test)) {
                    return true;
                }
            }
            // TODO test view modified
            return false;
        },
        unremove: function() {
            var records = this.current_view.selected_records();
            records.forEach(function(record) {
                record.group.unremove(record);
            });
        },
        remove: function(delete_, remove, force_remove) {
            var result = jQuery.Deferred();
            var records = null;
            if ((this.current_view.view_type == 'form') &&
                    this.current_record) {
                records = [this.current_record];
            } else if (this.current_view.view_type == 'tree') {
                records = this.current_view.selected_records();
            }
            if (jQuery.isEmptyObject(records)) {
                return;
            }
            var prm = jQuery.when();
            if (delete_) {
                // TODO delete children before parent
                prm = this.model.delete_(records);
            }
            prm.done(function() {
                records.forEach(function(record) {
                    record.group.remove(record, remove, true, force_remove);
                });
                var prms = [];
                if (delete_) {
                    records.forEach(function(record) {
                        if (record.group.parent) {
                            prms.push(record.group.parent.save());
                        }
                        if (record.group.record_deleted.indexOf(record) != -1) {
                            record.group.record_deleted.splice(
                                record.group.record_deleted.indexOf(record), 1);
                        }
                        if (record.group.record_removed.indexOf(record) != -1) {
                            record.group.record_removed.splice(
                                record.group.record_removed.indexOf(record), 1);
                        }
                        // TODO destroy
                    });
                }
                // TODO set current_record
                this.current_record = null;
                // TODO set_cursor
                jQuery.when.apply(jQuery, prms).done(function() {
                    this.display();
                    result.resolve();
                }.bind(this));
            }.bind(this));
            return result;
        },
        search_active: function(active) {
            if (active && !this.group.parent) {
                if (!this.fields_view_tree) {
                    this.model.execute('fields_view_get',
                            [false, 'tree'], this.context)
                        .then(function(view) {
                            this.fields_view_tree = view;
                            this.search_active(active);
                        }.bind(this));
                    return;
                }
                if (!this.domain_parser) {
                    var fields = jQuery.extend({},
                            this.fields_view_tree.fields);

                    var set_selection = function(props) {
                        return function(selection) {
                            props.selection = selection;
                        };
                    };
                    for (var name in fields) {
                        if (!fields.hasOwnProperty(name)) {
                            continue;
                        }
                        var props = fields[name];
                        if ((props.type != 'selection') &&
                                (props.type != 'reference')) {
                            continue;
                        }
                        if (props.selection instanceof Array) {
                            continue;
                        }
                        this.get_selection(props).then(set_selection);
                    }

                    // Filter only fields in XML view
                    var xml_view = jQuery(jQuery.parseXML(
                                this.fields_view_tree.arch));
                    var xml_fields = xml_view.find('tree').children()
                        .filter(function(node) {
                            return node.tagName == 'field';
                        }).map(function(node) {
                            return node.getAttribute('name');
                        });
                    var dom_fields = {};
                    xml_fields.each(function(name) {
                        dom_fields[name] = fields[name];
                    });
                    if (!('id' in fields)) {
                        fields.id = {
                            'string': 'ID',  // TODO translate
                            'name': 'id',
                            'type': 'integer'
                        };
                    }
                    this.domain_parser = new Sao.common.DomainParser(fields);
                }
                this.screen_container.set_screen(this);
                this.screen_container.show_filter();
            } else {
                this.screen_container.hide_filter();
            }
        },
        get_selection: function(props) {
            var prm;
            var change_with = props.selection_change_with;
            if (change_with) {
                var values = {};
                change_with.forEach(function(p) {
                    values[p] = null;
                });
                prm = this.model.execute(props.selection,
                        [values]);
            } else {
                prm = this.model.execute(props.selection,
                        []);
            }
            return prm.then(function(selection) {
                return selection.sort(function(a, b) {
                    return a[1].localeCompare(b[1]);
                });
            });
        },
        search_prev: function(search_string) {
            this.offset -= this.limit;
            this.search_filter(search_string);
        },
        search_next: function(search_string) {
            this.offset += this.limit;
            this.search_filter(search_string);
        },
        get: function() {
            if (!this.current_record) {
                return null;
            }
            this.current_view.set_value();
            return this.current_record.get();
        },
        get_on_change_value: function() {
            if (!this.current_record) {
                return null;
            }
            this.current_view.set_value();
            return this.current_record.get_on_change_value();
        },
        reload: function(ids, written) {
            this.group.reload(ids);
            if (written) {
                this.group.written(ids);
            }
            if (this.parent) {
                this.parent.reload();
            }
            this.display();
        },
        button: function(attributes) {
            // TODO confirm
            var record = this.current_record;
            record.save().done(function() {
                var context = record.get_context();
                record.model.execute(attributes.name,
                    [[record.id]], context).then(
                        function(action_id) {
                            if (action_id) {
                                Sao.Action.execute(action_id, {
                                    model: this.model_name,
                                    id: record.id,
                                    ids: [record.id]
                                }, null, context);
                            }
                            this.reload([record.id], true);
                        }.bind(this),
                        function() {
                            this.reload([record.id], true);
                        }.bind(this));
            }.bind(this));
        }
    });
}());
