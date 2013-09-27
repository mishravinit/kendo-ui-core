kendo_module({
    id: "mobile.scrollview",
    name: "ScrollView",
    category: "mobile",
    description: "The Kendo Mobile ScrollView widget is used to scroll content wider than the device screen.",
    depends: [ "mobile.application" ]
});

(function($, undefined) {
    var kendo = window.kendo,
        mobile = kendo.mobile,
        ui = mobile.ui,
        proxy = $.proxy,
        Transition = kendo.effects.Transition,
        Pane = kendo.ui.Pane,
        PaneDimensions = kendo.ui.PaneDimensions,
        Widget = ui.Widget,
        DataSource = kendo.data.DataSource,
        Buffer = kendo.data.Buffer,
        BatchBuffer = kendo.data.BatchBuffer,

        // Math
        math = Math,
        abs  = math.abs,
        ceil = math.ceil,
        round = math.round,
        max = math.max,
        min = math.min,
        floor = math.floor,

        CHANGE = "change",
        CHANGING = "changing",
        REFRESH = "refresh",
        CURRENT_PAGE_CLASS = "km-current-page",
        FUNCTION = "function",

        VIRTUAL_PAGE_COUNT = 3,
        LEFT_PAGE = -1,
        CETER_PAGE = 0,
        RIGHT_PAGE = 1,

        LEFT_SWIPE = -1,
        NUDGE = 0,
        RIGHT_SWIPE = 1;

    var Pager = kendo.Class.extend({
        init: function(scrollView) {
            var that = this,
                element = $("<ol class='km-pages'/>");

            scrollView.element.append(element);

            this._changeProxy = proxy(that, "_change");
            this._refreshProxy = proxy(that, "_refresh");
            scrollView.bind(CHANGE, this._changeProxy);
            scrollView.bind(REFRESH, this._refreshProxy);

            $.extend(that, { element: element, scrollView: scrollView });
        },

        items: function() {
            return this.element.children();
        },

        _refresh: function(e) {
            var pageHTML = "";

            for (var idx = 0; idx < e.pageCount; idx ++) {
                pageHTML += "<li/>";
            }

            this.element.html(pageHTML);
            this.items().eq(e.page).addClass(CURRENT_PAGE_CLASS);
        },

        _change: function(e) {
            this.items().removeClass(CURRENT_PAGE_CLASS).eq(e.page).addClass(CURRENT_PAGE_CLASS);
        },

        destroy: function() {
            this.scrollView.unbind(CHANGE, this._changeProxy);
            this.scrollView.unbind(REFRESH, this._refreshProxy);
            this.element.remove();
        }
    });

    kendo.mobile.ui.ScrollViewPager = Pager;

    var TRANSITION_END = "transitionEnd",
        DRAG_START = "dragStart",
        DRAG_END = "dragEnd";

    var ElasticPane = kendo.Observable.extend({
        init: function(element, options) {
            var that = this;

            kendo.Observable.fn.init.call(this);

            this.element = element;
            this.container = element.parent();

            var movable,
                transition,
                userEvents,
                dimensions,
                dimension,
                pane;

            movable = new kendo.ui.Movable(that.element);

            transition = new Transition({
                axis: "x",
                movable: movable,
                onEnd: function() {
                    that.trigger(TRANSITION_END);
                }
            });

            userEvents = new kendo.UserEvents(element, {
                start: function(e) {
                    if (abs(e.x.velocity) * 2 >= abs(e.y.velocity)) {
                        userEvents.capture();
                    } else {
                        userEvents.cancel();
                    }

                    that.trigger(DRAG_START, e);
                    transition.cancel();
                },
                allowSelection: true,
                end: function(e) {
                    that.trigger(DRAG_END, e);
                }
            });

            dimensions = new PaneDimensions({
                element: that.element,
                container: that.container
            });

            dimension = dimensions.x;

            dimension.bind(CHANGE, function() {
                that.trigger(CHANGE);
            });

            pane = new Pane({
                dimensions: dimensions,
                userEvents: userEvents,
                movable: movable,
                elastic: true
            });

            $.extend(that, {
                duration: options && options.duration || 1,
                movable: movable,
                transition: transition,
                userEvents: userEvents,
                dimensions: dimensions,
                dimension: dimension,
                pane: pane
            });

            this.bind([TRANSITION_END, DRAG_START, DRAG_END, CHANGE], options);
        },

        size: function() {
            return { width: this.dimensions.x.getSize(), height: this.dimensions.y.getSize() };
        },

        total: function() {
            return this.dimension.getTotal();
        },

        offset: function() {
            return -this.movable.x;
        },

        updateDimension: function() {
            this.dimension.update(true);
        },

        refresh: function() {
            this.dimensions.refresh();
        },

        moveTo: function(offset) {
            this.movable.moveAxis("x", -offset);
        },

        transitionTo: function(offset, ease, instant) {
            if (instant) {
                this.moveTo(-offset);
            } else {
                this.transition.moveTo({ location: offset, duration: this.duration, ease: ease });
            }
        }
    });

    kendo.mobile.ui.ScrollViewElasticPane = ElasticPane;

    var ScrollViewContent = kendo.Observable.extend({
        init: function(element, pane) {
            var that = this;

            kendo.Observable.fn.init.call(this);
            that.element = element;
            that.pane = pane;
            that._getPages();
            this.page = 0;
            this.pageSize = 1;
        },

        scrollTo: function(page, instant) {
            this.page = page;
            this.pane.transitionTo(- page * this.pane.size().width, Transition.easeOutExpo, instant);
        },

        paneMoved: function(swipeType, bounce, callback) {
            var that = this,
                pane = that.pane,
                width = pane.size().width * that.pageSize,
                approx = round,
                ease = bounce ? Transition.easeOutBack : Transition.easeOutExpo,
                snap,
                nextPage;

            if (swipeType === LEFT_SWIPE) {
                approx = ceil;
            } else if (swipeType === RIGHT_SWIPE) {
                approx = floor;
            }

            nextPage = approx(pane.offset() / width);

            snap = max(that.minSnap, min(-nextPage * width, that.maxSnap));

            if (nextPage != that.page) {
                if (callback && callback({ currentPage: that.page, nextPage: nextPage })) {
                    snap = -that.page * pane.size().width;
                }
            }

            pane.transitionTo(snap, ease);
        },

        updatePage: function() {
            var pane = this.pane,
                page = round(pane.offset() / pane.size().width);

            if (page != this.page) {
                this.page = page;
                return true;
            }

            return false;
        },

        forcePageUpdate: function() {
            return this.updatePage();
        },

        resizeTo: function(size) {
            var pane = this.pane,
                width = size.width;

            this.pageElements.width(width);

            // re-read pane dimension after the pageElements have been resized.
            pane.updateDimension();

            if (!this._paged) {
                this.page = floor(pane.offset() / width);
            }

            this.scrollTo(this.page, true);

            this.pageCount = ceil(pane.total() / width);
            this.minSnap = - (this.pageCount - 1) * width;
            this.maxSnap = 0;
        },

        _getPages: function() {
            this.pageElements = this.element.find("[data-role=page]");
            this._paged = this.pageElements.length > 0;
        }
    });

    kendo.mobile.ui.ScrollViewContent = ScrollViewContent;

    var VirtualScrollViewContent = kendo.Observable.extend({
        init: function(element, pane, options) {
            var that = this;

            kendo.Observable.fn.init.call(this);

            that.element = element;
            that.pane = pane;
            that.options = options;
            that._templates();
            that.page = 0;
            that.pages = [];
            that._initPages();
            that.resizeTo(that.pane.size());
            that.dataSource = DataSource.create(options.dataSource);
            that._buffer();
            that._pendingPageRefresh = false;
            that._pendingWidgetRefresh = false;

            if(that.options.autoBind) {
                that.dataSource.fetch();
            }

            that.pane.dimension.forceEnabled();
        },

        _viewShow: function() {
            var that = this;
            if(that._pendingWidgetRefresh) {
                setTimeout(function() {
                    that._resetPages();
                }, 0);
                that._pendingWidgetRefresh= false;
            }
        },

        _buffer: function() {
            var itemsPerPage = this.options.itemsPerPage;

            if(itemsPerPage > 1) {
                this.buffer = new BatchBuffer(this.dataSource, itemsPerPage);
            } else {
                this.buffer = new Buffer(this.dataSource, itemsPerPage * 3);
            }

            this._resizeProxy = proxy(this, "_onResize");
            this._resetProxy = proxy(this, "_onReset");
            this._endReachedProxy = proxy(this, "_onEndReached");

            this.buffer.bind({
                "resize": this._resizeProxy,
                "reset": this._resetProxy,
                "endreached": this._endReachedProxy
            });
        },

        _templates: function() {
            var template = this.options.template,
                emptyTemplate = this.options.emptyTemplate,
                templateProxy = {},
                emptyTemplateProxy = {};

            if(typeof template === FUNCTION) {
                templateProxy.template = template;
                template = "#=this.template(data)#";
            }

            this.template = proxy(kendo.template(template), templateProxy);

            if(typeof emptyTemplate === FUNCTION) {
                emptyTemplateProxy.emptyTemplate = emptyTemplate;
                emptyTemplate = "#=this.emptyTemplate(data)#";
            }

            this.emptyTemplate = proxy(kendo.template(emptyTemplate), emptyTemplateProxy);
        },

        _initPages: function() {
            var pages = this.pages,
                element = this.element,
                page;

            for (var i = 0; i < VIRTUAL_PAGE_COUNT; i++) {
                page = new Page(element);
                pages.push(page);
            }

            this.pane.updateDimension();
        },

        resizeTo: function(size) {
            var pages = this.pages,
                pane = this.pane;

            for (var i = 0; i < pages.length; i++) {
                pages[i].setWidth(size.width);
            }

            if (this.options.contentHeight === "auto") {
                this.element.css("height", this.pages[1].element.height());
            }

            else if (this.options.contentHeight === "100%") {
                var containerHeight = this.element.parent().height();
                this.element.css("height", containerHeight);
                pages[0].element.css("height", containerHeight);
                pages[1].element.css("height", containerHeight);
                pages[2].element.css("height", containerHeight);
            }

            pane.updateDimension();

            this._repositionPages();

            this.width = size.width;
        },

        scrollTo: function(page) {
            var buffer = this.buffer,
                dataItem;

            buffer.syncDataSource();
            dataItem = buffer.at(page);

            if(!dataItem) {
                return;
            }

            this._updatePagesContent(page);

            this.page = page;
        },

        paneMoved: function(swipeType, bounce, callback) {
            var that = this,
                pane = that.pane,
                width = pane.size().width,
                offset = pane.offset(),
                thresholdPassed = Math.abs(offset) >= width / 3,
                ease = bounce ? kendo.effects.Transition.easeOutBack : kendo.effects.Transition. easeOutExpo,
                isEndReached = that.page + 2 > that.buffer.total(),
                delta = 0;

            if(swipeType === RIGHT_SWIPE) {
                if(that.page !== 0) {
                    delta = -1; //backward
                }
            } else if(swipeType === LEFT_SWIPE && !isEndReached) {
                delta = 1; //forward
            } else if(offset > 0 && (thresholdPassed && !isEndReached)) {
                delta = 1; //forward
            } else if(offset < 0 && thresholdPassed) {
                if(that.page !== 0) {
                    delta = -1; //backward
                }
            }

            if(callback && callback()) {
                delta = 0;
            }

            if(delta === 0) {
                that._cancelMove(ease);
            } else if (delta === -1) {
                that._moveBackward();
            } else if (delta === 1) {
                that._moveForward();
            }
        },

        updatePage: function() {
            var pages = this.pages;

            if(this.pane.offset() === 0) {
                return false;
            }

            if(this.pane.offset() > 0) {
                pages.push(this.pages.shift());//forward
                this.page++;
                this.setPageContent(pages[2], this.page + 1);
            } else {
                pages.unshift(this.pages.pop()); //back
                this.page--;
                this.setPageContent(pages[0], this.page - 1);
            }

            this._repositionPages();

            this._resetMovable();

            return true;
        },

        forcePageUpdate: function() {
            var offset = this.pane.offset(),
                threshold  = this.pane.size().width * 3/4;

            if(abs(offset) > threshold) {
                return this.updatePage();
            }

            return false;
        },

        _resetMovable: function() {
            this.pane.moveTo(0);
        },

        _moveForward: function(instant) {
            this.pane.transitionTo(-this.width, kendo.effects.Transition.easeOutExpo, instant);
        },

        _moveBackward: function(instant) {
            this.pane.transitionTo(this.width, kendo.effects.Transition.easeOutExpo, instant);
        },

        _cancelMove: function(ease) {
            this.pane.transitionTo(0, ease, false);
        },

        _resetPages: function() {
            this._updatePagesContent();
            this._repositionPages();

            this.page = 0;

            this.trigger("reset");
        },

        _onResize: function() {
            var page = this.pages[2], //last page
                idx = this.page + 1;

            if(this._pendingPageRefresh) {
                this.setPageContent(page, idx);
                this._pendingPageRefresh = false;
            }
        },

        _onReset: function() {
            this.pageCount = this.dataSource.total();

            if(this.element.is(":visible")) {
                this._resetPages();
            } else {
                this._widgetNeedsRefresh = true;
            }
        },

        _onEndReached: function() {
            this._pendingPageRefresh = true;
        },

        _repositionPages: function() {
            var pages = this.pages;

            pages[0].position(LEFT_PAGE);
            pages[1].position(CETER_PAGE);
            pages[2].position(RIGHT_PAGE);
        },

        _updatePagesContent: function(offset) {
            var pages = this.pages,
                currentPage = offset || 0;

            this.setPageContent(pages[0], currentPage - 1);
            this.setPageContent(pages[1], currentPage);
            this.setPageContent(pages[2], currentPage + 1);
        },

        setPageContent: function(page, index) {
            var buffer = this.buffer,
                template = this.template,
                emptyTemplate = this.emptyTemplate,
                view;

            if(index >= 0) {
                view = buffer.at(index);
            }

            if(view) {
                page.content(template(view));
            } else {
                page.content(emptyTemplate({}));
            }

            kendo.mobile.init(page.element);
        }
    });

    kendo.mobile.ui.VirtualScrollViewContent = VirtualScrollViewContent;

    var Page = kendo.Class.extend({
        init: function(container) {
            this.element = $("<div class='km-virtual-page'></div>");
            this.width = container.width();
            this.element.width(this.width);
            container.append(this.element);
        },

        content: function(theContent) {
            this.element.html(theContent);
        },

        position: function(position) { //position can be -1, 0, 1
            this.element.css("transform", "translate3d(" + this.width * position + "px, 0, 0)");
        },

        setWidth: function(width) {
            this.width = width;
            this.element.width(width);
        }
    });

    kendo.mobile.ui.VirtualPage = Page;

    var ScrollView = Widget.extend({
        init: function(element, options) {
            var that = this;

            Widget.fn.init.call(that, element, options);

            options = that.options;
            element = that.element;

            kendo.stripWhitespace(element[0]);

            element
                .wrapInner("<div/>")
                .addClass("km-scrollview");

            if(this.options.enablePager) {
                this.pager = new Pager(this);
            }

            that.inner = element.children().first();
            that.page = 0;
            that.inner.css("height", options.contentHeight);
            that.container().bind("show", proxy(this, "viewShow")).bind("init", proxy(this, "viewInit"));

            that.pane = new ElasticPane(that.inner, {
                duration: this.options.duration,
                transitionEnd: proxy(this, "_transitionEnd"),
                dragStart: proxy(this, "_dragStart"),
                dragEnd: proxy(this, "_dragEnd"),
                change: proxy(this, REFRESH)
            });

            that.page = options.page;

            that._content = options.dataSource ? new VirtualScrollViewContent(that.inner, that.pane, options) : new ScrollViewContent(that.inner, that.pane);
            that._content.page = that.page;

            that._content.bind("reset", function() {
                that._syncWithContent();
            });
        },

        options: {
            name: "ScrollView",
            page: 0,
            duration: 300,
            velocityThreshold: 0.8,
            contentHeight: "auto",
            pageSize: 1,
            itemsPerPage: 1,
            bounceVelocityThreshold: 1.6,
            enablePager: true,
            autoBind: true,
            template: "",
            emptyTemplate: ""
        },

        events: [
            CHANGING,
            CHANGE,
            REFRESH
        ],

        destroy: function() {
            Widget.fn.destroy.call(this);
            kendo.destroy(this.element);
        },

        viewInit: function() {
            if(this.options.autoBind) {
                this._content.scrollTo(this._content.page, true);
            }
        },

        viewShow: function() {
            this.pane.refresh();
        },

        refresh: function() {
            var content = this._content;

            content.resizeTo(this.pane.size());
            this.page = content.page;
            this.trigger(REFRESH, { pageCount: content.pageCount, page: content.page });
        },

        content: function(html) {
           this.element.children().first().html(html);
           this._content._getPages();
           this.pane.refresh();
        },

        scrollTo: function(page, instant) {
            this._content.scrollTo(page, instant);
            this._syncWithContent();
        },

        _syncWithContent: function() {
            var pages = this._content.pages,
                buffer = this._content.buffer,
                data,
                element;

            this.page = this._content.page;

            data = buffer ? buffer.at(this.page) : undefined;
            if(!(data instanceof Array)) {
                data = [data];
            }
            element = pages ? pages[1].element : undefined;

            this.trigger(CHANGE, { page: this.page, element: element, data: data });
        },

        _dragStart: function() {
            if (this._content.forcePageUpdate()) {
                this._syncWithContent();
            }
        },

        _dragEnd: function(e) {
            var that = this,
                velocity = e.x.velocity,
                velocityThreshold = this.options.velocityThreshold,
                swipeType = NUDGE,
                bounce = abs(velocity) > this.options.bounceVelocityThreshold;

            if (velocity > velocityThreshold) {
                swipeType = RIGHT_SWIPE;
            } else if(velocity < -velocityThreshold) {
                swipeType = LEFT_SWIPE;
            }

            this._content.paneMoved(swipeType, bounce, function(eventData) {
                return that.trigger(CHANGING, eventData);
            });
        },

        _transitionEnd: function() {
            if (this._content.updatePage()) {
                this._syncWithContent();
            }
        }
    });

    ui.plugin(ScrollView);

})(window.kendo.jQuery);
